/*! Game Goofer GML bytecode scanner v0.1.0 - READ-ONLY. Walks compiled GML (bytecode 15+ layout) and resolves
 *  string / function / variable references. Instruction sizes and reference chains were verified exhaustively
 *  against one real file (see TECHNICAL-REPORT); `build().validation` re-verifies them on every file it is given.
 *  Does NOT decompile GML. Written from public format docs; no GPL code copied. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GMCodeScan = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const MNEMONIC = { 0x07: 'conv', 0x08: 'mul', 0x09: 'div', 0x0A: 'rem', 0x0B: 'mod', 0x0C: 'add', 0x0D: 'sub', 0x0E: 'and', 0x0F: 'or', 0x10: 'xor', 0x11: 'neg', 0x12: 'not', 0x13: 'shl', 0x14: 'shr', 0x15: 'cmp', 0x45: 'pop', 0x84: 'pushi', 0x86: 'dup', 0x99: 'callv', 0x9C: 'ret', 0x9D: 'exit', 0x9E: 'popz', 0xB6: 'b', 0xB7: 'bt', 0xB8: 'bf', 0xBA: 'pushenv', 0xBB: 'popenv', 0xC0: 'push', 0xC1: 'pushloc', 0xC2: 'pushglb', 0xC3: 'pushbltn', 0xD9: 'call', 0xFF: 'break' };
  const PUSH_SIZE = { 0: 8, 1: 4, 2: 4, 3: 8, 4: 4, 5: 4, 6: 4, 15: 0 }; // by data type: double float int32 int64 bool var string int16
  const TYPE_CHAR = { 0: 'd', 1: 'f', 2: 'i', 3: 'l', 4: 'b', 5: 'v', 6: 's', 15: 'e' };
  const SCOPE = { '-1': 'self', '-5': 'global', '-6': 'builtin', '-7': 'local', '-15': 'arg', '-16': 'static', '0': 'stack?' }; // 0 = instance supplied on the stack (inferred from usage statistics, not verified against docs)
  const CHAIN_MASK = 0x07ffffff;

  // cb(at, op, t1, t2, word, operandAt|0). Returns { count, error }.
  function walk(chunk, abs, len, cb) {
    let pos = abs, count = 0; const end = abs + len;
    if (!chunk.has(abs, len)) return { count, error: 'bytecode range outside CODE chunk' };
    while (pos < end) {
      if (pos + 4 > end) return { count, error: 'truncated instruction at +' + (pos - abs) };
      const w = chunk.u32(pos), op = w >>> 24, t1 = (w >>> 16) & 15, t2 = (w >>> 20) & 15;
      if (!MNEMONIC[op]) return { count, error: 'unknown opcode 0x' + op.toString(16) + ' at +' + (pos - abs) };
      let extra = 0;
      if (op === 0xC0) { if (!(t1 in PUSH_SIZE)) return { count, error: 'bad push type ' + t1 + ' at +' + (pos - abs) }; extra = PUSH_SIZE[t1]; }
      else if (op >= 0xC1 && op <= 0xC3) extra = 4;
      else if (op === 0x45) extra = t1 === 15 ? 0 : 4;
      else if (op === 0xD9) extra = 4;
      if (pos + 4 + extra > end) return { count, error: 'instruction overruns entry at +' + (pos - abs) };
      cb(pos, op, t1, t2, w, extra ? pos + 4 : 0);
      count++; pos += 4 + extra;
    }
    return { count, error: null };
  }
  const isVarOp = (op, t1, operandAt) => operandAt && ((op >= 0xC0 && op <= 0xC3 && t1 === 5) || op === 0x45);
  const isFuncOp = (op, t1, operandAt) => operandAt && (op === 0xD9 || (op === 0xC0 && t1 === 2));

  /* o: { code, entries:[{index,name,address,length}], vari, func (Chunk|null), strings:[], ref(ptr)->string, objectName(i)->string|null }
   * Returns an index with .validation (counts + failures) and refs()/listing() helpers. */
  function build(o) {
    const v = { entriesWalked: 0, entriesFailed: 0, failures: [], instructions: 0, functionOperands: null, variableOperands: null, ok: false };
    const funcAt = new Map(), varAt = new Map(), funcNames = [], varNames = [];
    const callOps = new Set(), pushOps = new Set(), varInstr = new Set(), seen = new Set();
    for (const e of o.entries) {
      const key = e.address + ':' + e.length; if (seen.has(key)) { v.entriesWalked++; continue; } seen.add(key);
      const r = walk(o.code, e.address, e.length, (at, op, t1, t2, w, opAt) => {
        if (op === 0xD9) callOps.add(opAt); else if (isFuncOp(op, t1, opAt)) pushOps.add(opAt); // push.i int32 may be a plain constant OR a function reference
        if (isVarOp(op, t1, opAt)) varInstr.add(at);
      });
      v.instructions += r.count;
      if (r.error) { v.entriesFailed++; if (v.failures.length < 5) v.failures.push(e.name + ': ' + r.error); } else v.entriesWalked++;
    }
    const chain = (list, valid, map, anchorIsOperand) => {
      let resolved = 0, broken = 0;
      list.forEach((it, idx) => {
        let a = it.first;
        for (let k = 0; k < it.occ; k++) {
          if (!valid(a) || map.has(a)) { broken++; break; }
          map.set(a, idx); resolved++;
          const opAt = anchorIsOperand ? a : a + 4;
          if (!o.code.has(opAt, 4)) { broken++; break; }
          a += o.code.u32(opAt) & CHAIN_MASK;
        }
      });
      return { resolved, broken };
    };
    try {
      if (o.func && o.func.size >= 4) {
        const n = o.func.u32(o.func.start);
        if (4 + n * 12 > o.func.size) throw new Error('FUNC count does not fit chunk');
        const list = [];
        for (let i = 0; i < n; i++) { const p = o.func.start + 4 + 12 * i; list.push({ name: o.ref(o.func.u32(p)), occ: o.func.u32(p + 4), first: o.func.u32(p + 8) }); funcNames.push(list[i].name); }
        const c = chain(list, (a) => callOps.has(a) || pushOps.has(a), funcAt, true);
        let rc = 0; for (const a of funcAt.keys()) if (callOps.has(a)) rc++;
        v.functionOperands = { chainsBroken: c.broken, resolved: rc, total: callOps.size, functionRefsPushed: c.resolved - rc, entries: n };
      }
      if (o.vari && o.vari.size >= 12) {
        // NOTE: the two header counts are NOT the entry count (verified); entries fill the chunk after the 12-byte header.
        const n = Math.floor((o.vari.size - 12) / 20), list = [];
        for (let i = 0; i < n; i++) { const p = o.vari.start + 12 + 20 * i; list.push({ name: o.ref(o.vari.u32(p)), instance: o.vari.i32(p + 4), occ: o.vari.u32(p + 12), first: o.vari.u32(p + 16) }); varNames.push(list[i]); }
        const c = chain(list, (a) => varInstr.has(a), varAt, false);
        v.variableOperands = { chainsBroken: c.broken, resolved: c.resolved, total: varInstr.size, entries: n };
      }
    } catch (e) { v.failures.push('reference tables: ' + e.message); }
    v.ok = v.entriesFailed === 0 && v.functionOperands && v.functionOperands.chainsBroken === 0 && v.functionOperands.resolved === v.functionOperands.total
      && v.variableOperands && v.variableOperands.chainsBroken === 0 && v.variableOperands.resolved === v.variableOperands.total && !v.failures.length;

    const funcName = (opAt) => funcAt.has(opAt) ? funcNames[funcAt.get(opAt)] : null;
    const varInfo = (at) => varAt.has(at) ? varNames[varAt.get(at)] : null;
    const str = (i) => (i >= 0 && i < o.strings.length ? o.strings[i] : '<string index ' + i + ' out of range>');
    const scopeOf = (w) => { const s = (w << 16) >> 16; return SCOPE[s] || (s >= 0 ? (o.objectName && o.objectName(s)) || 'object#' + s : 'inst' + s); };

    function lines(e) {
      const out = [];
      const r = walk(o.code, e.address, e.length, (at, op, t1, t2, w, opAt) => {
        const m = MNEMONIC[op], rel = at - e.address, tc = TYPE_CHAR[t1] || t1;
        let text;
        if (op === 0xD9) { const f = funcName(opAt); text = 'call ' + (f || '<unresolved>') + ' argc=' + (w & 0xffff); }
        else if (op === 0xC0 && t1 === 6) text = 'push.s ' + JSON.stringify(str(o.code.u32(opAt)));
        else if (op === 0xC0 && t1 === 2) text = funcAt.has(opAt) ? 'push.i funcref ' + funcName(opAt) : 'push.i ' + o.code.i32(opAt);
        else if (op === 0xC0 && t1 === 0) text = 'push.d ' + o.code.dv.getFloat64(opAt - o.code.start, true);
        else if (op === 0xC0 && t1 === 1) text = 'push.f ' + o.code.dv.getFloat32(opAt - o.code.start, true);
        else if (op === 0xC0 && t1 === 3) text = 'push.l ' + o.code.dv.getBigInt64(opAt - o.code.start, true);
        else if (op === 0xC0 && t1 === 4) text = 'push.b ' + o.code.u32(opAt);
        else if (op === 0x84) text = 'pushi ' + ((w << 16) >> 16);
        else if (isVarOp(op, t1, opAt)) { const vi = varInfo(at); text = m + '.' + (TYPE_CHAR[t1] || t1) + '.' + (TYPE_CHAR[t2] || t2) + ' ' + scopeOf(w) + '.' + (vi ? vi.name : '<unresolved>'); }
        else if (op === 0x15) text = 'cmp.' + (TYPE_CHAR[t1] || t1) + (TYPE_CHAR[t2] || t2) + ' kind=' + ((w >>> 8) & 0xff);
        else if (op >= 0xB6 && op <= 0xBB) text = m + ' ' + ((w << 9) >> 9);
        else text = m + (m === 'break' ? ' ' + ((w << 16) >> 16) : '.' + tc + '.' + (TYPE_CHAR[t2] || t2));
        out.push({ at: rel, text });
      });
      return { lines: out, error: r.error };
    }

    function refs(e) {
      const strings = new Map(), calls = new Map(), vars = new Map(), ints = new Map(), funcrefs = new Map();
      const r = walk(o.code, e.address, e.length, (at, op, t1, t2, w, opAt) => {
        const bump = (m, k) => m.set(k, (m.get(k) || 0) + 1);
        if (op === 0xD9) bump(calls, funcName(opAt) || '<unresolved>');
        else if (op === 0xC0 && t1 === 6) bump(strings, o.code.u32(opAt));
        else if (op === 0xC0 && t1 === 2) { if (funcAt.has(opAt)) bump(funcrefs, funcName(opAt)); else bump(ints, o.code.i32(opAt)); }
        else if (op === 0x84) bump(ints, (w << 16) >> 16);
        else if (isVarOp(op, t1, opAt)) { const vi = varInfo(at); bump(vars, scopeOf(w) + '.' + (vi ? vi.name : '<unresolved>')); }
      });
      const top = (m, f) => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => f(k, n));
      return {
        name: e.name, address: e.address, length: e.length, instructions: r.count, error: r.error,
        strings: top(strings, (i, n) => ({ index: i, text: str(i), count: n })),
        calls: top(calls, (name, n) => ({ name, count: n })),
        functionRefs: top(funcrefs, (name, n) => ({ name, count: n })),
        variables: top(vars, (name, n) => ({ name, count: n })),
        integers: top(ints, (value, n) => ({ value, count: n })),
      };
    }
    return { validation: v, refs, lines };
  }
  return { build, walk, VERSION: '0.1.0' };
});
