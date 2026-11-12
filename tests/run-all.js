/* Runs every suite and prints a count per suite.
   npm test                                  local copy of this folder
   npm test -- --site=https://test.<project>.pages.dev   a live site (unit tests still run on the local code) */
const { spawnSync } = require('child_process');
const path = require('path');
const { serve, siteURL } = require('./serve.js');
const smoke = require('./smoke.js');
const CONFIG = require('./config.js');
const flows = CONFIG.flows ? require('./flows.js') : null;

const ROOT = path.resolve(__dirname, '..');
const MIN = 60 * 1000;
// Time limits, so a run always ends with a result instead of hanging (override in config.js).
const LIMIT = { unit: (CONFIG.unitMinutes || 5) * MIN, smoke: (CONFIG.smokeMinutes || 3) * MIN, flows: (CONFIG.flowsMinutes || 4) * MIN };

/* A browser suite within its time limit; a crash or a timeout counts as one failure with the reason. */
async function browserSuite(name, fn) {
  try { return await Promise.race([fn(), timeout(LIMIT[name], name)]); }
  catch (e) { return { pass: 0, fail: 1, note: e.message.split('\n')[0] }; }
}

const timeout = (ms, what) => new Promise((_, reject) => setTimeout(() => reject(new Error(`${what} timed out after ${ms / MIN} min`)), ms).unref());

/* Runs a script that prints "N passed, M failed", within the unit time limit. */
function nodeSuite(file) {
  if (!file) return null;
  const out = spawnSync(process.execPath, [path.join(ROOT, file)], { cwd: ROOT, encoding: 'utf8', timeout: LIMIT.unit });
  if (out.error) return { pass: 0, fail: 1, note: out.error.code === 'ETIMEDOUT' ? `timed out after ${LIMIT.unit / MIN} min` : out.error.message };
  out.stdout.split('\n').filter(l => l.startsWith('FAIL')).forEach(l => console.log(l));
  const m = /(\d+) passed, (\d+) failed/.exec(out.stdout);
  if (!m) return { pass: 0, fail: 1, note: 'could not read the result: ' + (out.stderr || out.stdout).slice(0, 300) };
  return { pass: +m[1], fail: +m[2] + (out.status ? 1 : 0) };
}

(async () => {
  const arg = process.argv.find(a => a.startsWith('--site='));
  let server = null, site = arg && arg.slice(7);
  if (!site) { server = await serve(ROOT); site = `http://127.0.0.1:${server.address().port}/`; }
  else if (!siteURL(site)) { console.log(`--site must start with http:// or https:// (got ${site})`); process.exit(1); }
  else site = siteURL(site);   // with or without a trailing '/'
  const results = { unit: nodeSuite(CONFIG.unit), kit: nodeSuite('tests/kit.js') };
  results.smoke = await browserSuite('smoke', () => smoke.run(site, { local: !!server }));
  if (flows) results.flows = await browserSuite('flows', () => flows.run(site));
  if (server) server.close();

  console.log(`\nSite: ${site}`);
  let failed = 0;
  for (const [name, r] of Object.entries(results)) {
    if (!r) continue;
    failed += r.fail;
    console.log(`${name.padEnd(6)} ${r.pass} passed, ${r.fail} failed${r.note ? '  (' + r.note + ')' : ''}`);
  }
  process.exit(failed ? 1 : 0);
})();
