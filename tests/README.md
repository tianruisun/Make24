# Tests

One-time setup: `npm install`. The browser suites use the installed Google Chrome (or run `npx playwright install chromium` on a PC without Chrome).

| Command | What it runs |
|---|---|
| `npm test` | every suite against a local copy of this folder |
| `npm test -- --site=https://test.terence-sun-make24.pages.dev` | the browser suites against the Test site (unit tests still run on the local code) |
| `npm test -- --site=https://terence-sun-make24.pages.dev` | the same against Production |

Each run prints a count per suite and exits non-zero if anything failed.

| Suite | File | Covers |
|---|---|---|
| unit | `run.js` | `version.js` is well formed and lists the Production host; `sw.js` caches every file `index.html` loads |
| kit | `kit.js` | the test kit: `serve.js` finds files with the folder written five ways, `../` cannot leave the folder, a folder with no `index.html` is refused, `--site` with or without `/` |
| smoke | `smoke.js` | page loads with no console errors; fits a 375px phone; TEST badge shows `TEST v<version>` off Production and is absent on Production; offline cache is named after `version.js` |

Screenshots go to `<system temp>/Terence_Sun_Make24-tests/`, never into the repo.

Time limits: unit 5 min, smoke 3 min, flows 4 min, any single browser step 20 s. A run that hits one reports `timed out` as a failure; it never hangs.
