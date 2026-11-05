#!/usr/bin/env node
// Research CLI: node tools/probe-code.js <data-file> <command> [args]
//   names <regex>            code entries whose name matches
//   refs <exact-name>        strings/calls/variables referenced by one code entry
//   list <exact-name> [n]    resolved instruction listing (first n lines)
//   grep-strings <regex>     STRG entries matching, with the code entries that push them
//   users <regex-of-ref>     code entries that call a function / touch a variable / push a string matching regex
// Read-only. Prints identifiers and short string literals from a user-supplied file; redistribute nothing it prints in bulk.
const fs = require('fs'); const path = require('path');
const R = require('../gm-data-reader.js');
(async () => {
  const [file, cmd, arg, arg2] = process.argv.slice(2);
  if (!file || !cmd) { console.error('usage: probe-code.js <file> <names|refs|list|grep-strings|users> <arg>'); process.exit(2); }
  const blob = fs.openAsBlob ? await fs.openAsBlob(file) : new Blob([fs.readFileSync(file)]); blob.name = path.basename(file);
  const { report, data } = await R.inspect(blob, {});
  if (!data.codeScan) { console.error('no bytecode scan available:', report.errors.concat(report.warnings).join('; ')); process.exit(1); }
  const code = report.sections.code.items.filter((c) => c.address !== undefined);
  const scan = data.codeScan, re = arg && new RegExp(arg, 'i');
  const pad = (s, n) => String(s).padEnd(n);
  if (cmd === 'names') code.filter((c) => re.test(c.name)).forEach((c) => console.log(pad(c.index, 5), pad(c.length + 'B', 7), c.name));
  else if (cmd === 'refs') { const e = code.find((c) => c.name === arg); if (!e) return console.error('no such code entry'); console.log(JSON.stringify(scan.refs(e), null, 1)); }
  else if (cmd === 'list') { const e = code.find((c) => c.name === arg); if (!e) return console.error('no such code entry'); const l = scan.lines(e); l.lines.slice(0, +arg2 || 200).forEach((x) => console.log(pad(x.at, 6), x.text)); if (l.error) console.log('ERROR', l.error); }
  else if (cmd === 'grep-strings') {
    const hits = new Set(); data.strings.forEach((t, i) => { if (re.test(t)) hits.add(i); });
    console.log(hits.size, 'matching strings');
    const seen = new Set();
    for (const e of code) { if (seen.has(e.address + ':' + e.length)) continue; seen.add(e.address + ':' + e.length); const r = scan.refs(e); const m = r.strings.filter((s) => hits.has(s.index)); if (m.length) console.log(pad(e.name, 60), m.map((s) => JSON.stringify(s.text.slice(0, 40))).join(' ')); }
  } else if (cmd === 'users') {
    const seen = new Set();
    for (const e of code) { if (seen.has(e.address + ':' + e.length)) continue; seen.add(e.address + ':' + e.length); const r = scan.refs(e);
      const m = [...r.calls.filter((c) => re.test(c.name)).map((c) => 'call ' + c.name + 'x' + c.count), ...r.variables.filter((v) => re.test(v.name)).map((v) => 'var ' + v.name + 'x' + v.count), ...r.functionRefs.filter((c) => re.test(c.name)).map((c) => 'fref ' + c.name)];
      if (m.length) console.log(pad(e.name, 60), m.join(' ')); }
  }
})();
