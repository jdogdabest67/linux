/*! Game Goofer GM data reader v0.1.0 - read-only inspector for GameMaker FORM data files (data.win/game.unx).
 *  Written from public format documentation; no code copied from UndertaleModLib/LibGM (both GPL-3.0).
 *  Reads only the chunks it needs via Blob.slice, so huge audio/texture chunks are never loaded. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GMDataReader = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const VERSION = '0.3.0';
  const Scan = typeof GMCodeScan !== 'undefined' ? GMCodeScan : (typeof require === 'function' ? (function () { try { return require('./gm-code-scan.js'); } catch (e) { return null; } })() : null);
  // Chunk names listed by LibGM's ChunkName enum (docs.rs/libgm). Anything else is reported as unknown.
  const KNOWN = 'ACRV AGRP AUDO BGND CODE DAFL EMBI EXTN FEAT FEDS FONT FUNC GEN8 GLOB GMEN LANG OBJT OPTN PATH PSEM PSYS ROOM SCPT SEQN SHDR SOND SPRT STRG TAGS TGIN TMLN TPAG TXTR UILR VARI'.split(' ');
  const NAMES_ONLY = ['OBJT', 'SPRT', 'SOND', 'BGND', 'FONT', 'PATH', 'SHDR', 'TMLN', 'CODE', 'ROOM', 'SCPT'];
  // Minimum GameMaker version implied by chunk existence, per LibGM version_detection (an inference, not a reading).
  const IMPLIES = [['UILR', '2024.13'], ['PSEM', '2023.2'], ['FEAT', '2022.8'], ['FEDS', '2.3.6'], ['SEQN', '2.3'], ['TGIN', '2.2.1']];
  const MAX_CHUNK_LOAD = 256 * 1024 * 1024;
  class ParseError extends Error {}

  class Chunk {
    constructor(info, buf) { Object.assign(this, info); this.dv = new DataView(buf); this.u8 = new Uint8Array(buf); }
    has(abs, n) { return abs >= this.start && abs + n <= this.start + this.size; }
    u32(abs) { if (!this.has(abs, 4)) throw new ParseError(this.name + ': read out of range at 0x' + abs.toString(16)); return this.dv.getUint32(abs - this.start, true); }
    i32(abs) { return this.u32(abs) | 0; }
  }

  const hex = (n) => '0x' + n.toString(16);
  const ascii = (u8, o, n) => String.fromCharCode.apply(null, Array.from(u8.subarray(o, o + n)));
  const bytes = async (file, a, b) => {
    const buf = await file.slice(a, b).arrayBuffer();
    if (buf.byteLength !== b - a) throw new ParseError('Short read at ' + hex(a));
    return buf;
  };

  function sniff(head) {
    const m = ascii(head, 0, 4);
    if (m === 'FORM') return { kind: 'form' };
    if (m === 'MROF') return { kind: 'big-endian', note: 'Big-endian GameMaker data (reversed chunk names) is not supported.' };
    if (m.startsWith('PK')) return { kind: 'zip', note: 'This looks like a ZIP archive, not a raw data file. Extract it first.' };
    if (head[0] === 0x1f && head[1] === 0x8b) return { kind: 'gzip', note: 'This looks gzip-compressed. Decompress it first.' };
    return { kind: 'unknown', note: 'No FORM signature. First bytes: ' + Array.from(head.subarray(0, 8)).map((b) => b.toString(16).padStart(2, '0')).join(' ') };
  }

  async function inspect(file, options) {
    const opts = Object.assign({ onProgress: () => {} }, options);
    const report = {
      tool: { name: 'Game Goofer UNX Inspector', readerVersion: VERSION, generatedAt: new Date().toISOString() },
      file: { name: file.name || null, size: file.size },
      container: {}, gen8: null, chunks: [], sections: {}, warnings: [], errors: [],
    };
    const data = { strings: [] };
    const warn = (m) => report.warnings.push(m);
    const fail = (m) => report.errors.push(m);
    const chunks = new Map();
    const cache = new Map();
    let badStrRefs = 0;

    try {
      if (file.size < 12) throw new ParseError('File is too small to be a GameMaker data file.');
      const head = new Uint8Array(await bytes(file, 0, Math.min(file.size, 16)));
      const sn = sniff(head);
      report.container.signature = ascii(head, 0, 4);
      if (sn.kind !== 'form') throw new ParseError(sn.note);
      const formSize = new DataView(head.buffer).getUint32(4, true);
      Object.assign(report.container, { endianness: 'little', declaredFormSize: formSize, expectedFileSize: formSize + 8 });
      let end = formSize + 8;
      if (end > file.size) { warn('FORM header declares ' + end + ' bytes but file has ' + file.size + ' (truncated?).'); end = file.size; }
      else if (end < file.size) warn((file.size - end) + ' trailing bytes after the FORM block were ignored.');

      opts.onProgress('Scanning chunk table...');
      let pos = 8;
      while (pos + 8 <= end) {
        const h = new Uint8Array(await bytes(file, pos, pos + 8));
        const name = ascii(h, 0, 4);
        const size = new DataView(h.buffer).getUint32(4, true);
        if (!/^[A-Z0-9]{4}$/.test(name)) { fail('Invalid chunk name at ' + hex(pos) + '; stopped scanning.'); break; }
        const info = { name, headerOffset: pos, start: pos + 8, size };
        if (info.start + size > end) { warn('Chunk ' + name + ' extends past end of file; stopped scanning.'); report.chunks.push({ name, offset: pos, size, truncated: true }); break; }
        if (chunks.has(name)) warn('Duplicate chunk ' + name + ' at ' + hex(pos) + ' ignored.');
        else chunks.set(name, info);
        report.chunks.push({ name, offset: pos, size, status: !KNOWN.includes(name) ? 'unknown' : name === 'GEN8' || name === 'STRG' ? 'summary' : NAMES_ONLY.includes(name) ? 'names-only' : 'recognized-unparsed' });
        pos = info.start + size;
      }

      const load = async (name) => {
        if (cache.has(name)) return cache.get(name);
        const info = chunks.get(name);
        if (!info) return null;
        if (info.size > MAX_CHUNK_LOAD) throw new ParseError(name + ' is too large to load in the browser.');
        const c = new Chunk(info, await bytes(file, info.start, info.start + info.size));
        cache.set(name, c);
        return c;
      };
      const section = async (label, fn) => { try { await fn(); } catch (e) { fail(label + ': ' + e.message); } };

      const strg = await load('STRG').catch((e) => { fail('STRG: ' + e.message); return null; });
      const dec = new TextDecoder('utf-8');
      const strCache = new Map();
      // Pointers from other chunks point at the first character; the u32 length sits 4 bytes before.
      const ref = (ptr) => {
        if (ptr === 0) return null;
        if (strCache.has(ptr)) return strCache.get(ptr);
        let s;
        if (!strg || !strg.has(ptr - 4, 4)) s = null;
        else { const len = strg.u32(ptr - 4); s = strg.has(ptr, len) ? dec.decode(strg.u8.subarray(ptr - strg.start, ptr - strg.start + len)) : null; }
        if (s === null) { badStrRefs++; s = '<bad string ref ' + hex(ptr) + '>'; }
        strCache.set(ptr, s);
        return s;
      };

      await section('GEN8', async () => {
        const c = await load('GEN8');
        if (!c) throw new ParseError('GEN8 chunk missing.');
        const s = c.start;
        report.gen8 = {
          wadVersion: c.u8[1], gameId: c.u32(s + 20), name: ref(c.u32(s + 40)), displayName: ref(c.u32(s + 100)),
          fileName: ref(c.u32(s + 4)),
          gameMakerVersionFields: [c.u32(s + 44), c.u32(s + 48), c.u32(s + 52), c.u32(s + 56)].join('.'),
          defaultWindow: c.u32(s + 60) + 'x' + c.u32(s + 64),
          note: 'GEN8 version fields may not match the exact GameMaker runtime version; UndertaleModTool does deeper detection.',
        };
        if (badStrRefs) warn('GEN8 string references did not resolve; GEN8 layout assumption may not fit this file.');
      });

      // --- name-list chunks: [u32 count][u32 ptr * count], each element starts with a name pointer ---
      const lists = {};
      const readList = async (cn) => {
        const c = await load(cn);
        if (!c) return null;
        const count = c.u32(c.start);
        if (4 + count * 4 > c.size) throw new ParseError(cn + ': element count ' + count + ' does not fit in chunk.');
        const ptrs = [];
        for (let i = 0; i < count; i++) ptrs.push(c.u32(c.start + 4 + i * 4));
        return { c, count, ptrs };
      };
      const parseNamed = async (cn, key, extra) => {
        await section(cn, async () => {
          const L = await readList(cn);
          if (!L) return;
          const items = []; let nulls = 0, invalid = 0;
          L.ptrs.forEach((p, index) => {
            if (p === 0) { nulls++; return; }
            if (!L.c.has(p, 4)) { invalid++; return; }
            const item = { index, name: ref(L.c.u32(p)), offset: hex(p) };
            if (extra) { try { extra(item, L.c, p); } catch (e) { item.layoutError = e.message; } }
            items.push(item);
          });
          lists[key] = { count: L.count, items };
          report.sections[key] = { chunk: cn, count: L.count, nullEntries: nulls, invalidEntries: invalid, items };
        });
      };
      const dim = (item, c, p) => { item.width = c.u32(p + 4); item.height = c.u32(p + 8); };
      await parseNamed('SPRT', 'sprites', dim);
      await parseNamed('SOND', 'sounds');
      for (const [cn, k] of [['BGND', 'backgrounds'], ['FONT', 'fonts'], ['PATH', 'paths'], ['SHDR', 'shaders'], ['TMLN', 'timelines']]) await parseNamed(cn, k);
      const wad15 = report.gen8 && report.gen8.wadVersion >= 15;
      await parseNamed('CODE', 'code', wad15 ? (it, c, p) => {
        it.length = c.u32(p + 4); it.locals = c.u32(p + 8) & 0xffff; it.args = c.u32(p + 8) >>> 16;
        it.address = p + 12 + c.i32(p + 12); it.bytecodeAt = hex(it.address); it.parentOffset = c.u32(p + 16);
      } : null);
      await parseNamed('ROOM', 'rooms', (it, c, p) => { it.caption = ref(c.u32(p + 4)); it.width = c.u32(p + 8); it.height = c.u32(p + 12); });
      const nSpr = lists.sprites ? lists.sprites.count : null;
      let objLayout = null;
      await section('OBJT layout', async () => {
        const L = await readList('OBJT');
        if (!L) return;
        const evidence = ['FEAT', 'PSEM', 'UILR'].some((n) => chunks.has(n)) ? true : null;
        const score = (managed) => {
          const o = managed ? 4 : 0; let n = 0, ok = 0, none = 0;
          for (const p of L.ptrs) {
            if (!p || n >= 300) continue;
            n++;
            if (!L.c.has(p, 36)) continue;
            const sp = L.c.i32(p + 4), vis = L.c.u32(p + 8), sol = L.c.u32(p + 12 + o), dep = L.c.i32(p + 16 + o), per = L.c.u32(p + 20 + o), par = L.c.i32(p + 24 + o);
            const man = managed ? L.c.u32(p + 12) : 0;
            const good = vis < 2 && sol < 2 && per < 2 && man < 2 && Math.abs(dep) < 1000000 && sp >= -1 && sp < (nSpr === null ? 1000000 : nSpr) && (par === -100 || par === -1 || (par >= 0 && par < L.count));
            if (good) ok++;
            if (par === -100) none++;
          }
          return n ? { frac: ok / n, none: none / n } : null;
        };
        const A = score(false), B = score(true);
        if (A === null) return;
        const a = A.frac, b = B.frac;
        let managed = b > a, confidence, basis;
        if (Math.max(a, b) >= 0.95 && Math.abs(a - b) >= 0.3) { confidence = 'high'; basis = 'field plausibility'; }
        else if (a >= 0.95 && b >= 0.95 && Math.abs(A.none - B.none) >= 0.3) {
          // Both layouts look plausible; most objects have no parent (-100), and only the true layout reads that value.
          managed = B.none > A.none;
          confidence = evidence === null || evidence === managed ? 'high' : 'low';
          basis = 'no-parent (-100) prevalence' + (evidence === managed ? ' + chunk evidence agree' : '');
        } else { confidence = 'low'; basis = 'inconclusive'; }
        objLayout = { managed, scoreWithoutManagedField: +a.toFixed(3), scoreWithManagedField: +b.toFixed(3), noParentShareWithout: +A.none.toFixed(3), noParentShareWith: +B.none.toFixed(3), chunkEvidenceManaged: evidence, confidence, basis };
        if (evidence !== null && evidence !== managed) warn('OBJT field layout inferred from data disagrees with the chunk-presence evidence (FEAT/PSEM/UILR imply the 2022.5+ layout). Object detail columns are unreliable.');
        if (confidence === 'low') warn('OBJT field layout could not be determined with high confidence; object detail columns (sprite, parent, depth, flags) may be wrong. Names are unaffected.');
        report.objectLayout = objLayout;
      });
      await parseNamed('OBJT', 'objects', (it, c, p) => {
        const o = objLayout && objLayout.managed ? 4 : 0;
        if (!objLayout || objLayout.confidence !== 'high') return; // do not display guessed fields
        it.sprite = c.i32(p + 4); it.visible = c.u32(p + 8) !== 0; it.solid = c.u32(p + 12 + o) !== 0;
        it.depth = c.i32(p + 16 + o); it.persistent = c.u32(p + 20 + o) !== 0; it.parent = c.i32(p + 24 + o);
      });
      await parseNamed('SCPT', 'scripts', (it, c, p) => { it.codeId = c.i32(p + 4); });

      // post-process cross references
      const objs = lists.objects ? lists.objects.items : [];
      const byIdx = new Map(objs.map((o) => [o.index, o.name]));
      const sprByIdx = new Map((lists.sprites ? lists.sprites.items : []).map((x) => [x.index, x.name]));
      objs.forEach((o) => {
        if (o.sprite === undefined) return;
        o.spriteName = o.sprite >= 0 ? (sprByIdx.get(o.sprite) || null) : null;
        o.parentName = o.parent === -1 ? '(self)' : o.parent === -100 ? null : (byIdx.get(o.parent) || null);
      });
      if (lists.code) {
        const re = /^gml_Object_(.+)_(Create|Destroy|Alarm|Step|Collision|Keyboard|Mouse|Other|Draw|KeyPress|KeyRelease|Gesture|Asynchronous|PreCreate|CleanUp)_(\d+)$/;
        const counts = new Map(); let matched = 0;
        lists.code.items.forEach((c) => { const m = re.exec(c.name || ''); if (m) { matched++; c.object = m[1]; c.event = m[2] + '_' + m[3]; counts.set(m[1], (counts.get(m[1]) || 0) + 1); } });
        objs.forEach((o) => { o.codeEntriesByName = counts.get(o.name) || 0; });
        report.sections.code.note = 'object/event columns come from the gml_Object_<name>_<Event>_<n> naming convention, not from parsed event tables.';
        report.sections.code.namingConventionMatches = matched;
        const codeByIdx = new Map(lists.code.items.map((x) => [x.index, x.name]));
        if (lists.scripts) lists.scripts.items.forEach((sc) => {
          if (sc.codeId >= 0 && codeByIdx.has(sc.codeId)) sc.codeName = codeByIdx.get(sc.codeId);
          else if (sc.codeId < -1) sc.codeName = '(raw id ' + sc.codeId + '; high bit set, meaning unverified)';
        });
      }
      if (badStrRefs) warn(badStrRefs + ' string references pointed outside STRG.');

      await section('STRG list', async () => {
        const L = strg && await readList('STRG');
        if (!L) return;
        let bad = 0;
        for (const p of L.ptrs) {
          if (!strg.has(p, 4)) { bad++; data.strings.push('<invalid string entry>'); continue; }
          const len = strg.u32(p);
          if (!strg.has(p + 4, len)) { bad++; data.strings.push('<invalid string entry>'); continue; }
          data.strings.push(dec.decode(strg.u8.subarray(p + 4 - strg.start, p + 4 - strg.start + len)));
        }
        report.sections.strings = { chunk: 'STRG', count: L.count, invalidEntries: bad };
        if (bad > L.count * 0.05) warn('Many STRG entries failed to decode (' + bad + '/' + L.count + ').');
      });
      await section('Bytecode scan', async () => {
        if (!lists.code || !wad15) return;
        if (!Scan) { warn('gm-code-scan.js is not loaded; bytecode references are unavailable.'); return; }
        const code = await load('CODE');
        const vari = chunks.has('VARI') ? await load('VARI') : null, func = chunks.has('FUNC') ? await load('FUNC') : null;
        const entries = lists.code.items.filter((i) => i.address !== undefined && i.length > 0);
        if (!entries.length) return;
        const objName = new Map((lists.objects ? lists.objects.items : []).map((x) => [x.index, x.name]));
        const idx = Scan.build({ code, entries, vari, func, strings: data.strings, ref, objectName: (i) => objName.get(i) || null });
        data.codeScan = idx; report.bytecode = idx.validation;
        if (!idx.validation.ok) warn('Bytecode self-verification did not fully pass (see Validation tab); treat code references as unreliable.');
      });

      if (report.bytecode) report.chunks.forEach((c) => { if (c.name === 'CODE') c.status = 'names+bytecode-refs'; else if (c.name === 'VARI' || c.name === 'FUNC') c.status = 'reference-tables'; });
      // ---- version reporting (inference only; exact GameMaker version is NOT determined) ----
      const present = IMPLIES.filter(([n]) => chunks.has(n));
      report.version = {
        wadVersion: report.gen8 ? report.gen8.wadVersion : null,
        gen8Fields: report.gen8 ? report.gen8.gameMakerVersionFields : null,
        minimumImpliedByChunks: present.length ? present[0][1] + ' (from ' + present[0][0] + ' chunk)' : null,
        exactVersion: 'not determined',
        note: 'GMS2-era files store 2.0.0.0 in GEN8; the real version needs deeper detection (UndertaleModTool/LibGM do this). Chunk presence only gives a lower bound.',
      };
      if (report.gen8 && (report.gen8.wadVersion < 15 || report.gen8.wadVersion > 17)) warn('WAD version ' + report.gen8.wadVersion + ' is outside the 15-17 range this reader was designed around; results are untested.');

      // ---- validation summary ----
      const checks = [];
      const chk = (id, status, detail) => checks.push({ id, status, detail });
      chk('container', report.container.signature === 'FORM' ? 'pass' : 'fail', 'signature ' + report.container.signature);
      const last = report.chunks[report.chunks.length - 1];
      chk('chunk-walk', last && !last.truncated && last.offset + 8 + last.size === Math.min(file.size, report.container.expectedFileSize || 0) ? 'pass' : 'warn', 'chunk table ' + (last && !last.truncated ? 'ends exactly at end of FORM block' : 'did not end cleanly'));
      chk('required-chunks', chunks.has('GEN8') && chunks.has('STRG') ? 'pass' : 'fail', 'GEN8 ' + (chunks.has('GEN8') ? 'present' : 'missing') + ', STRG ' + (chunks.has('STRG') ? 'present' : 'missing'));
      chk('gen8-strings', report.gen8 && report.gen8.name && !/^<bad/.test(report.gen8.name) ? 'pass' : 'fail', 'game name ' + (report.gen8 ? JSON.stringify(report.gen8.name) : 'unreadable'));
      if (report.sections.strings) chk('string-table', report.sections.strings.invalidEntries === 0 ? 'pass' : 'warn', report.sections.strings.invalidEntries + ' of ' + report.sections.strings.count + ' STRG entries invalid');
      for (const [k, sec] of Object.entries(report.sections)) {
        if (k === 'strings') continue;
        const badNames = sec.items.filter((i) => /^<bad/.test(i.name || '')).length;
        chk('list-' + k, sec.invalidEntries === 0 && badNames === 0 ? 'pass' : 'warn', sec.count + ' entries, ' + sec.nullEntries + ' null, ' + sec.invalidEntries + ' out-of-chunk pointers, ' + badNames + ' unresolved names');
      }
      if (objLayout) chk('object-layout', objLayout.confidence === 'high' ? 'pass' : 'warn', 'managed field ' + (objLayout.managed ? 'present' : 'absent') + ', confidence ' + objLayout.confidence);
      if (report.bytecode) { const b = report.bytecode; chk('bytecode', b.ok ? 'pass' : 'warn', b.entriesWalked + ' entries / ' + b.instructions + ' instructions walked exactly (' + b.entriesFailed + ' failed); call operands ' + (b.functionOperands ? b.functionOperands.resolved + '/' + b.functionOperands.total + ' (+' + b.functionOperands.functionRefsPushed + ' pushed function refs)' : 'n/a') + ', variable refs ' + (b.variableOperands ? b.variableOperands.resolved + '/' + b.variableOperands.total : 'n/a') + ' resolved'); }
      const unknown = report.chunks.filter((c) => c.status === 'unknown').map((c) => c.name);
      chk('unknown-chunks', unknown.length ? 'warn' : 'pass', unknown.length ? 'unrecognised: ' + unknown.join(', ') : 'none');
      const unparsed = report.chunks.filter((c) => c.status === 'recognized-unparsed').map((c) => c.name);
      chk('unparsed-chunks', 'info', 'recognised but not parsed by this tool: ' + (unparsed.join(', ') || 'none'));
      report.validation = { status: report.errors.length || checks.some((c) => c.status === 'fail') ? 'fail' : checks.some((c) => c.status === 'warn') || report.warnings.length ? 'warn' : 'pass', checks };
    } catch (e) {
      fail(e.message);
    }
    if (!report.validation) report.validation = { status: 'fail', checks: [{ id: 'container', status: 'fail', detail: report.errors[0] || 'unreadable' }] };
    return { report, data };
  }

  return { VERSION, inspect, sniff };
});
