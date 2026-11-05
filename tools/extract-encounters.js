#!/usr/bin/env node
// Research CLI: node tools/extract-encounters.js <data-file> [--json]
// Decodes the switch(argument0) in the compiled scr_encountersetup script into per-case monster slot assignments.
// Read-only. Output stays on your machine; it is derived from YOUR copy of the game, so do not commit/redistribute it.
// Pattern assumptions (verified by eye on one Deltarune Ch1 file, NOT proven general): case dispatch = [dup, pushi N, cmp ==, bt target],
// assignments = [pushi VALUE, conv.i.v, pushi -5, pushi SLOT, pop.v.v monstertype|monsterinstancetype].
const fs = require('fs'); const path = require('path'); const R = require('../gm-data-reader.js');
(async () => {
  const file = process.argv[2]; if (!file) { console.error('usage: extract-encounters.js <file> [--json]'); process.exit(2); }
  const blob = fs.openAsBlob ? await fs.openAsBlob(file) : new Blob([fs.readFileSync(file)]); blob.name = path.basename(file);
  const { report, data } = await R.inspect(blob, {});
  if (!data.codeScan) { console.error('bytecode scan unavailable'); process.exit(1); }
  const e = report.sections.code.items.find((c) => c.name === 'gml_Script_scr_encountersetup');
  if (!e) { console.error('scr_encountersetup not found'); process.exit(1); }
  const objName = new Map(report.sections.objects.items.map((o) => [o.index, o.name]));
  const L = data.codeScan.lines(e).lines; const at = new Map(L.map((l, i) => [l.at, i]));
  const num = (t, p) => { const m = new RegExp('^' + p + ' (-?\\d+)$').exec(t); return m ? +m[1] : null; };
  // 1) dispatch table
  const start = L.findIndex((l) => /^push\.v\.d arg\.argument0$/.test(l.text)); if (start < 0) { console.error('argument0 switch not found'); process.exit(1); }
  const cases = []; let i = start + 1;
  while (i + 3 < L.length && L[i].text === 'dup.v.d' && num(L[i + 1].text, 'pushi') !== null && /^cmp\.iv kind=3$/.test(L[i + 2].text) && /^bt -?\d+$/.test(L[i + 3].text)) {
    cases.push({ n: num(L[i + 1].text, 'pushi'), target: L[i + 3].at + 4 * +L[i + 3].text.split(' ')[1] }); i += 4;
  }
  const badTargets = cases.filter((c) => !at.has(c.target)).length;
  // 2) per-case writes: scan from target until an unconditional branch, collecting assignments
  const out = []; const targetSet = new Set(cases.map((c) => c.target));
  for (const c of cases) {
    const slots = {}; let conditional = false; let k = at.get(c.target);
    for (; k !== undefined && k < L.length; k++) {
      const t = L[k].text;
      if (k > at.get(c.target) && targetSet.has(L[k].at)) break;      // next case body begins
      if (/^b -?\d+$/.test(t)) break;                                  // unconditional jump = end of this case body
      if (/^(bf|bt) /.test(t) || /^call instance_exists/.test(t)) conditional = true;
      const m = /^pop\.v\.v stack\?\.(monstertype|monsterinstancetype)$/.exec(t);
      if (m && k >= 4 && num(L[k - 4].text, 'pushi') !== null && L[k - 3].text === 'conv.i.v' && L[k - 2].text === 'pushi -5' && num(L[k - 1].text, 'pushi') !== null) {
        const slot = num(L[k - 1].text, 'pushi'), v = num(L[k - 4].text, 'pushi'); (slots[slot] = slots[slot] || {})[m[1]] = v;
      }
    }
    out.push({ encounter: c.n, bodyAt: c.target, conditional, slots });
  }
  if (process.argv.includes('--json')) { console.log(JSON.stringify(out.map((o) => ({ ...o, slots: Object.entries(o.slots).map(([s, v]) => ({ slot: +s, monstertype: v.monstertype, instanceObject: v.monsterinstancetype, instanceObjectName: objName.get(v.monsterinstancetype) || null })) })), null, 1)); return; }
  console.log('dispatch cases:', cases.length, '| targets not on an instruction boundary:', badTargets);
  for (const o of out) console.log(String(o.encounter).padStart(3), o.conditional ? '[cond]' : '      ', Object.entries(o.slots).map(([s, v]) => s + ':' + (objName.get(v.monsterinstancetype) || '#' + v.monsterinstancetype) + '/type' + v.monstertype).join('  '));
})();
