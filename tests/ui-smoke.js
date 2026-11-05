// UI logic smoke test: runs unx-inspector.html's inline script against a minimal DOM stub (NOT a real browser).
// usage: GM_REAL_FILE=/path/to/game.unx node tests/ui-smoke.js   (without it, uses nothing and exits 0 with SKIPPED)
const fs = require('fs'); const path = require('path'); const assert = require('assert');
if (!process.env.GM_REAL_FILE) { console.log('ui-smoke: SKIPPED (set GM_REAL_FILE)'); process.exit(0); }
const html = fs.readFileSync(path.join(__dirname, '..', 'unx-inspector.html'), 'utf8');
const script = html.split('<script>')[1].split('</script>')[0];
const els = {}; class El { constructor(id) { this.id = id; this.hidden = false; this.innerHTML = ''; this.textContent = ''; this.value = ''; this.disabled = false; this.checked = false; this.dataset = {}; this.h = {}; this.classList = { add() {}, remove() {} }; }
  addEventListener(n, f) { (this.h[n] = this.h[n] || []).push(f); } scrollIntoView() {} click() {} }
global.document = { getElementById: (id) => (els[id] = els[id] || new El(id)), createElement: () => new El('a') };
global.URL = { createObjectURL: () => 'blob:x', revokeObjectURL() {} };
global.GMCodeScan = require('../gm-code-scan.js'); global.GMDataReader = require('../gm-data-reader.js');
new Function(script)();
const fire = (id, n, ev) => (els[id].h[n] || []).forEach((f) => f(ev));
(async () => {
  const blob = await fs.openAsBlob(process.env.GM_REAL_FILE); blob.name = 'game.unx';
  fire('file', 'change', { target: { files: [blob] } });
  for (let i = 0; i < 100 && els.results.hidden !== false; i++) await new Promise((r) => setTimeout(r, 50));
  assert.strictEqual(els.results.hidden, false, 'results never shown: ' + els.issues.innerHTML);
  assert.ok(/bytecode self-check/.test(els.view.innerHTML) && /walked exactly/.test(els.view.innerHTML), 'overview missing bytecode check');
  assert.ok(!/class="msg err"/.test(els.issues.innerHTML), 'unexpected error banner');
  fire('tabs', 'click', { target: { dataset: { t: 'objects' } } });
  assert.ok(/353 of 353 shown/.test(els.view.innerHTML), 'objects tab count wrong');
  fire('tabs', 'click', { target: { dataset: { t: 'code' } } }); els.q.value = 'encounterbasic_create'; fire('q', 'input', {});
  const m = /data-open="(\d+)"/.exec(els.view.innerHTML); assert.ok(m, 'no refs button for encounterbasic Create');
  fire('view', 'click', { target: { id: '', dataset: { open: m[1] } } });
  assert.ok(/gml_Object_obj_encounterbasic_Create_0/.test(els.detail.innerHTML) && /scr_encountersetup/.test(els.detail.innerHTML), 'detail panel missing resolved call');
  fire('tabs', 'click', { target: { dataset: { t: 'validation' } } });
  assert.ok(/bytecode/.test(els.view.innerHTML)); console.log('ui-smoke: passed (stub DOM, real file)');
})().catch((e) => { console.error('ui-smoke FAILED:', e.message); process.exit(1); });
