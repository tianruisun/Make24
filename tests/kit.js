/* Run with: node tests/kit.js  (the test kit itself: serve.js finds files whatever way the folder is written) */
const assert = require('assert');
const path = require('path');
const { fileFor, serve, siteURL } = require('./serve.js');
let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; } catch (e) { fail++; console.log('FAIL', name, '-', e.message); } }

const ROOT = path.resolve(__dirname, '..');
const spellings = {
  'Windows backslashes': ROOT,
  'forward slashes': ROOT.split(path.sep).join('/'),
  'trailing slash': ROOT.split(path.sep).join('/') + '/',
  'lower-case drive': ROOT[0].toLowerCase() + ROOT.slice(1),
  'relative': path.relative(process.cwd(), ROOT) || '.'
};
for (const [name, root] of Object.entries(spellings)) {
  t(`${name}: finds index.html`, () => assert.ok(fileFor(root, '/')));
  t(`${name}: finds sw.js`, () => assert.strictEqual(String(fileFor(root, '/sw.js')).toLowerCase(), path.join(ROOT, 'sw.js').toLowerCase()));   // Windows paths ignore case
}
for (const url of ['/../package.json', '/..%2f..%2fpackage.json', '/..\..\package.json', '/%2e%2e/%2e%2e/package.json']) {
  t(`${url} stays inside the folder`, () => {
    const f = fileFor(ROOT, url);
    assert.ok(f === null || f.startsWith(ROOT + path.sep), f);
  });
}
t('missing file is null', () => assert.strictEqual(fileFor(ROOT, '/no-such-file.js'), null));

// --site with or without a trailing '/' must reach the same pages
const sites = {
  'https://test.x.pages.dev': 'https://test.x.pages.dev/',
  'https://test.x.pages.dev/': 'https://test.x.pages.dev/',
  'https://u.github.io/Student_Practice': 'https://u.github.io/Student_Practice/',
  'https://u.github.io/Student_Practice/': 'https://u.github.io/Student_Practice/',
  'http://127.0.0.1:8080?x=1#y': 'http://127.0.0.1:8080/'
};
for (const [given, want] of Object.entries(sites)) t(`site ${given}`, () => assert.strictEqual(siteURL(given), want));
for (const bad of ['test.x.pages.dev', 'ftp://x/', '', 'file:///D:/x/']) t(`site refused: '${bad}'`, () => assert.strictEqual(siteURL(bad), null));

serve(path.join(ROOT, 'no-such-folder'))
  .then(() => { fail++; console.log('FAIL serve rejects a folder with no index.html'); }, e => { /no index\.html/.test(e.message) ? pass++ : fail++; })
  .finally(() => { console.log(`${pass} passed, ${fail} failed`); process.exitCode = fail ? 1 : 0; });
