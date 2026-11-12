/* Browser smoke tests: the page loads with no console errors, fits a phone screen, shows the TEST badge
   everywhere except Production, and the offline cache is named after the version in version.js. */
const fs = require('fs'), os = require('os'), path = require('path'), vm = require('vm');
const { chromium } = require('playwright');
const { fileFor, TYPES } = require('./serve.js');
const CONFIG = require('./config.js');

const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(os.tmpdir(), path.basename(ROOT) + '-tests');

function localVersion() {
  const box = {};
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'version.js'), 'utf8'), { self: box });
  return box;
}

/* The installed Chrome first (no download needed); Playwright's own Chromium if Chrome is missing. */
async function launch() {
  try { return await chromium.launch({ channel: 'chrome' }); }
  catch (e) { return chromium.launch(); }
}

async function openPage(browser, url, options = {}) {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, ...options.context });
  if (options.fakeHost) {
    // Serve the local files under a Production host name, to check the badge stays hidden there.
    await context.route(`https://${options.fakeHost}/**`, route => {
      const file = fileFor(ROOT, new URL(route.request().url()).pathname);
      if (!file) return route.fulfill({ status: 404, body: 'not found' });
      route.fulfill({ status: 200, contentType: TYPES[path.extname(file)], body: fs.readFileSync(file) });
    });
  }
  context.setDefaultTimeout(20000);   // no single step may wait longer than 20 s
  const page = await context.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));
  const res = await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(1000);
  return { context, page, errors, status: res && res.status() };
}

async function run(site, { local = false } = {}) {
  const { APP_VERSION, PRODUCTION_HOSTS } = localVersion();
  const isProduction = PRODUCTION_HOSTS.includes(new URL(site).hostname);
  fs.mkdirSync(SHOTS, { recursive: true });
  let pass = 0, fail = 0;
  const check = (name, ok, detail) => { ok ? pass++ : fail++; if (!ok) console.log('FAIL smoke:', name, detail || ''); };

  const browser = await launch();
  try {
    const { context, page, errors, status } = await openPage(browser, site);
    check('page loads (HTTP 200)', status === 200, status);
    check('page has a title', (await page.title()).trim().length > 0);
    check('no console errors', errors.length === 0, errors.join(' | '));
    const noSideScroll = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
    check('fits a 375px phone screen', noSideScroll);
    const badge = await page.$('#testBadge');
    if (isProduction) check('no TEST badge on Production', !badge);
    else check(`TEST badge reads "TEST v${APP_VERSION}"`, badge && (await badge.textContent()) === 'TEST v' + APP_VERSION,
      badge ? await badge.textContent() : 'no badge');
    const caches = await page.evaluate(async () => {
      await Promise.race([navigator.serviceWorker.ready, new Promise(r => setTimeout(r, 8000))]);
      await new Promise(r => setTimeout(r, 1500));
      return (await self.caches.keys());
    });
    check(`offline cache is ${CONFIG.cachePrefix + APP_VERSION}`, caches.includes(CONFIG.cachePrefix + APP_VERSION), caches.join(','));
    await page.screenshot({ path: path.join(SHOTS, 'home.png') });
    await context.close();

    if (local) {
      const host = PRODUCTION_HOSTS[0];
      const prod = await openPage(browser, `https://${host}/`, { fakeHost: host, context: { serviceWorkers: 'block' } });
      check(`no TEST badge when served as ${host}`, !(await prod.page.$('#testBadge')));
      check(`no console errors when served as ${host}`, prod.errors.length === 0, prod.errors.join(' | '));
      await prod.context.close();
    }
  } finally {
    await browser.close();
  }
  return { pass, fail };
}

module.exports = { run, launch };
