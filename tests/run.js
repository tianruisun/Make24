/* Run with: node tests/run.js  (unit tests of the app's plain logic, no browser) */
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; } catch (e) { fail++; console.log('FAIL', name, '-', e.message); } }

/* ---------- version.js ---------- */
const box = {};
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'version.js'), 'utf8'), { self: box });
t('version is X.Y.Z', () => assert.match(box.APP_VERSION, /^\d+\.\d+\.\d+$/));
t('Production host listed', () => assert.ok(box.PRODUCTION_HOSTS.includes('tianrui-make24.pages.dev')));
t('sw.js caches every file the page loads', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const used = [...html.matchAll(/(?:src|href)="([^"#:]+)"/g)].map(m => m[1]).filter(f => !f.endsWith('sw.js'));
  for (const f of used) {
    assert.ok(fs.existsSync(path.join(ROOT, f)), `${f} is missing`);
    assert.ok(sw.includes(`'./${f}'`), `${f} is not in sw.js`);
  }
});

console.log(`${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
