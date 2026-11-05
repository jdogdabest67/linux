// Run: node tests/test-reader.js   (Node 18+). Uses a SYNTHETIC fixture, not real game data.
const R = require('../gm-data-reader.js'); const assert = require('assert');
function build(strs, managed, allNoParent) {
  const out = []; const w = (n) => { const b = Buffer.alloc(4); b.writeInt32LE(n | 0); out.push(b); };
  const chunk = (name, body) => { const h = Buffer.alloc(8); h.write(name, 0, 'ascii'); h.writeUInt32LE(body.length, 4); return Buffer.concat([h, body]); };
  // STRG first so offsets are known: [count][ptrs][len,chars,0]*
  const sb = []; let off = 8 + (8 + 140) + 8 + 4 + strs.length * 4; const sp = [];
  for (const s of strs) { sp.push(off); const t = Buffer.from(s); const e = Buffer.alloc(4 + t.length + 1); e.writeUInt32LE(t.length); t.copy(e, 4); sb.push(e); off += e.length; }
  const hd = Buffer.alloc(4 + 4 * strs.length); hd.writeUInt32LE(strs.length); sp.forEach((p, i) => hd.writeUInt32LE(p, 4 + 4 * i));
  const STRG = chunk('STRG', Buffer.concat([hd, ...sb]));
  const strPtr = (i) => sp[i] + 4;
  const list = (startAbs, els) => { const n = els.length; let p = startAbs + 4 + 4 * n; const hdr = Buffer.alloc(4 + 4 * n); hdr.writeUInt32LE(n); const body = [];
    els.forEach((e, i) => { hdr.writeUInt32LE(e === null ? 0 : p, 4 + 4 * i); if (e) { body.push(e); p += e.length; } }); return Buffer.concat([hdr, ...body]); };
  const i32s = (...a) => { const b = Buffer.alloc(4 * a.length); a.forEach((v, i) => b.writeInt32LE(v, 4 * i)); return b; };
  const gen8 = Buffer.alloc(140); gen8[1] = 17; gen8.writeUInt32LE(strPtr(0), 40); gen8.writeUInt32LE(strPtr(0), 100); gen8.writeUInt32LE(2022, 44);
  gen8.writeUInt32LE(640, 60); gen8.writeUInt32LE(480, 64);
  let pos = 8; const parts = [];
  const add = (name, bodyFn) => { const body = bodyFn(pos + 8); const c = Buffer.isBuffer(body) && name === 'STRG' ? body : chunk(name, body); parts.push(c); pos += c.length; };
  add('GEN8', () => gen8);
  parts.push(STRG); pos += STRG.length;
  add('SPRT', (s) => list(s, [i32s(strPtr(3), 16, 16)]));
  const pad = Buffer.alloc(64); // real records carry physics + event data after the fixed fields
  const obj = (name, sprite, solid, depth, persistent, parent) => Buffer.concat([i32s(...(managed ? [name, sprite, 1, 1, solid, depth, persistent, parent, -1] : [name, sprite, 1, solid, depth, persistent, parent, -1])), pad]);
  add('OBJT', (s) => list(s, allNoParent ? [obj(strPtr(1), -1, 0, 0, 0, -100), obj(strPtr(2), -1, 0, 0, 0, -100)] : [obj(strPtr(1), 0, 0, 0, 0, -100), null, obj(strPtr(2), -1, 0, 5, 0, 0)]));
  add('CODE', (s) => list(s, [i32s(strPtr(4), 0, 0, 0, 0)])); // v15+ layout: name, length, locals/args, rel address, parent offset
  add('ROOM', (s) => list(s, [i32s(strPtr(5), strPtr(5), 320, 240)]));
  const body = Buffer.concat(parts); const f = Buffer.alloc(8); f.write('FORM'); f.writeUInt32LE(body.length, 4);
  return Buffer.concat([f, body]);
}
(async () => {
  const strs = ['TestGame', 'obj_alpha', 'obj_beta', 'spr_a', 'gml_Object_obj_alpha_Create_0', 'room_one'];
  const { report, data } = await R.inspect(new Blob([build(strs)]), {});
  assert.deepStrictEqual(report.errors, [], report.errors.join('\n'));
  assert.strictEqual(report.gen8.name, 'TestGame'); assert.strictEqual(report.gen8.wadVersion, 17);
  const o = report.sections.objects; assert.strictEqual(o.count, 3); assert.strictEqual(o.nullEntries, 1);
  assert.strictEqual(o.items[1].name, 'obj_beta'); assert.strictEqual(o.items[1].parentName, 'obj_alpha');
  assert.strictEqual(o.items[0].codeEntriesByName, 1);
  assert.strictEqual(report.sections.rooms.items[0].width, 320);
  assert.strictEqual(data.strings.length, 6);
  const bad = (b) => R.inspect(new Blob([b]), {});
  assert.ok((await bad(Buffer.from('PK\x03\x04aaaaaaaaaaaa'))).report.errors[0].includes('ZIP'));
  assert.ok((await bad(Buffer.from('MROFaaaaaaaaaaaa'))).report.errors[0].includes('Big-endian'));
  const full = build(strs); const t = await bad(full.subarray(0, full.length - 30));
  assert.ok(t.report.warnings.some((w) => /truncated/.test(w)));

  // ---- A.2 additions ----
  const mk = (name, body) => { const h = Buffer.alloc(8); h.write(name, 0, 'ascii'); h.writeUInt32LE(body.length, 4); return Buffer.concat([h, body]); };
  const form = (...cs) => { const b = Buffer.concat(cs); const f = Buffer.alloc(8); f.write('FORM'); f.writeUInt32LE(b.length, 4); return Buffer.concat([f, b]); };
  const run = (b) => R.inspect(new Blob([b]), {});
  // unknown chunk is reported, not fatal
  let r = (await run(form(mk('GEN8', Buffer.alloc(140)), mk('ZZZ9', Buffer.alloc(8))))).report;
  assert.strictEqual(r.chunks[1].status, 'unknown'); assert.ok(r.validation.checks.some((c) => c.id === 'unknown-chunks' && c.status === 'warn'));
  // chunk size overruns file -> warning + truncated flag
  const big = mk('OBJT', Buffer.alloc(8)); big.writeUInt32LE(9999, 4);
  r = (await run(form(mk('GEN8', Buffer.alloc(140)), big))).report;
  assert.ok(r.chunks.some((c) => c.truncated) && r.warnings.some((w) => /extends past/.test(w)));
  // bad chunk name stops scanning with an error
  r = (await run(form(mk('GEN8', Buffer.alloc(140)), Buffer.from('xx\x00\x01\x08\x00\x00\x00aaaaaaaa')))).report;
  assert.ok(r.errors.some((e) => /Invalid chunk name/.test(e)));
  // absurd element count and out-of-chunk pointers do not crash and are flagged
  const cnt = Buffer.alloc(8); cnt.writeUInt32LE(0x7fffffff);
  r = (await run(form(mk('GEN8', Buffer.alloc(140)), mk('STRG', Buffer.alloc(4)), mk('ROOM', cnt)))).report;
  assert.ok(r.errors.some((e) => /does not fit/.test(e)) && r.validation.status === 'fail');
  const badPtr = Buffer.alloc(8); badPtr.writeUInt32LE(1); badPtr.writeUInt32LE(0x00ffffff, 4);
  r = (await run(form(mk('GEN8', Buffer.alloc(140)), mk('STRG', Buffer.alloc(4)), mk('SPRT', badPtr)))).report;
  assert.strictEqual(r.sections.sprites.invalidEntries, 1);
  // version reporting is an inference and says so
  const v = (await run(build(strs))).report.version;
  assert.strictEqual(v.exactVersion, 'not determined'); assert.strictEqual(v.wadVersion, 17);
  assert.strictEqual(v.minimumImpliedByChunks, null);
  const withFeat = form(mk('GEN8', Buffer.alloc(140)), mk('FEAT', Buffer.alloc(4)));
  assert.ok((await run(withFeat)).report.version.minimumImpliedByChunks.startsWith('2022.8'));
  assert.strictEqual((await run(withFeat)).report.chunks[1].status, 'recognized-unparsed');
  // object layout autodetect: 2022.5+ layout (extra 'managed' bool after visible)
    const m = (await R.inspect(new Blob([build(strs, true)]), {})).report;
  assert.strictEqual(m.objectLayout.managed, true); assert.strictEqual(m.objectLayout.confidence, 'high');
  assert.strictEqual(m.sections.objects.items[1].parentName, 'obj_alpha'); assert.strictEqual(m.sections.objects.items[1].depth, 5);
  const u = (await R.inspect(new Blob([build(strs, false)]), {})).report;
  assert.strictEqual(u.objectLayout.managed, false); assert.strictEqual(u.objectLayout.confidence, 'high');
  assert.strictEqual(u.validation.status, 'pass', JSON.stringify(u.validation.checks.filter((c) => c.status !== 'pass')));
  // regression: real Deltarune data was ambiguous (both layouts plausible); the no-parent (-100) share must break the tie
  const tie = (await R.inspect(new Blob([build(strs, true, true)]), {})).report.objectLayout;
  assert.strictEqual(tie.managed, true); assert.strictEqual(tie.confidence, 'high');
  assert.strictEqual((await R.inspect(new Blob([build(strs, false, true)]), {})).report.objectLayout.managed, false);

  // ---- A.3: bytecode scanner on a hand-built fixture (still synthetic; real-file proof is the GM_REAL_FILE run) ----
  function buildCode(mut) {
    mut = mut || {};
    const strs = ['TestGame', 'gml_Script_t', 'fn_test', 'var_x', 'hello'];
    const w32 = (...a) => { const b = Buffer.alloc(4 * a.length); a.forEach((v, i) => b.writeUInt32LE(v >>> 0, 4 * i)); return b; };
    const mkc = (n, body) => { const h = Buffer.alloc(8); h.write(n, 0, 'ascii'); h.writeUInt32LE(body.length, 4); return Buffer.concat([h, body]); };
    let so = 164 + 4 + 4 * strs.length; const sp = []; const se = [];
    for (const s of strs) { sp.push(so); const b = Buffer.from(s); const e = Buffer.concat([w32(b.length), b, Buffer.alloc(1)]); se.push(e); so += e.length; }
    const strgBody = Buffer.concat([w32(strs.length, ...sp), ...se]); const sref = (i) => sp[i] + 4;
    const gen8 = Buffer.alloc(140); gen8[1] = 17; gen8.writeUInt32LE(sref(0), 40); gen8.writeUInt32LE(sref(0), 100);
    const codeStart = 164 + strgBody.length + 8, bcAbs = codeStart + 8, entryAbs = bcAbs + 28;
    const bc = Buffer.concat([w32(0xC0060000, 4), w32(0xD9020001, 0), w32(0x4555FFFF, 0), w32(mut.endWord === undefined ? 0x9D000000 : mut.endWord)]);
    const entry = Buffer.alloc(20); entry.writeUInt32LE(sref(1), 0); entry.writeUInt32LE(28, 4); entry.writeUInt32LE(1, 8); entry.writeInt32LE(bcAbs - (entryAbs + 12), 12);
    const codeBody = Buffer.concat([w32(1, entryAbs), bc, entry]);
    const funcStart = codeStart + codeBody.length + 8;
    const funcBody = Buffer.concat([w32(1), w32(sref(2), 1, bcAbs + 12 + (mut.badFunc ? 8 : 0))]);
    const variBody = Buffer.concat([w32(1, 1, 0), w32(sref(3)), Buffer.from(new Int32Array([-1]).buffer), w32(0, 1, bcAbs + 16)]);
    const body = Buffer.concat([mkc('GEN8', gen8), mkc('STRG', strgBody), mkc('CODE', codeBody), mkc('FUNC', funcBody), mkc('VARI', variBody)]);
    const f = Buffer.alloc(8); f.write('FORM'); f.writeUInt32LE(body.length, 4); return Buffer.concat([f, body]);
  }
  const good = await R.inspect(new Blob([buildCode()]), {});
  assert.deepStrictEqual(good.report.errors, [], good.report.errors.join('\n'));
  assert.strictEqual(good.report.bytecode.ok, true, JSON.stringify(good.report.bytecode));
  assert.strictEqual(good.report.bytecode.functionOperands.resolved, 1); assert.strictEqual(good.report.bytecode.variableOperands.resolved, 1);
  const ce = good.report.sections.code.items[0]; assert.strictEqual(ce.length, 28); assert.strictEqual(ce.bytecodeAt, '0x' + ce.address.toString(16));
  const rf = good.data.codeScan.refs(ce);
  assert.deepStrictEqual(rf.strings.map((s) => s.text), ['hello']); assert.deepStrictEqual(rf.calls.map((c) => c.name), ['fn_test']); assert.deepStrictEqual(rf.variables.map((v) => v.name), ['self.var_x']);
  assert.ok(good.data.codeScan.lines(ce).lines.some((l) => l.text === 'call fn_test argc=1'));
  assert.ok(good.report.validation.checks.some((c) => c.id === 'bytecode' && c.status === 'pass'));
  // corrupted reference chain -> scanner refuses to claim success
  const badF = await R.inspect(new Blob([buildCode({ badFunc: true })]), {});
  assert.strictEqual(badF.report.bytecode.ok, false); assert.ok(badF.report.warnings.some((w) => /self-verification/.test(w)));
  // unknown opcode -> entry reported as failed, not silently decoded
  const badOp = await R.inspect(new Blob([buildCode({ endWord: 0x01000000 })]), {});
  assert.strictEqual(badOp.report.bytecode.entriesFailed, 1); assert.ok(/unknown opcode/.test(badOp.report.bytecode.failures[0]));
  // real-file test: only runs when GM_REAL_FILE points at a user-supplied, legally owned data file
  if (process.env.GM_REAL_FILE) {
    const fs = require('fs'); const real = await R.inspect(new Blob([fs.readFileSync(process.env.GM_REAL_FILE)]), {});
    console.log('REAL FILE validation:', real.report.validation.status); console.log(real.report.validation.checks.map((c) => c.status + ' ' + c.id + ': ' + c.detail).join('\n'));
    assert.deepStrictEqual(real.report.errors, [], 'real file produced errors');
    assert.notStrictEqual(real.report.validation.status, 'fail');
    const bc = real.report.validation.checks.find((c) => c.id === 'bytecode');
    if (bc) assert.strictEqual(bc.status, 'pass', 'bytecode self-verification must pass on a real file: ' + bc.detail);
    const ol = real.report.validation.checks.find((c) => c.id === 'object-layout');
    if (ol) assert.strictEqual(ol.status, 'pass', 'object layout must be high-confidence: ' + ol.detail);
  } else console.log('real-file test: SKIPPED (set GM_REAL_FILE=/path/to/game.unx; never run in this build)');

  console.log('all reader tests passed');
})().catch((e) => { console.error(e); process.exit(1); });
