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
| unit | `run.js` | `version.js` is well formed and lists the Production host; `sw.js` caches every file `index.html` loads; exact fractions (8 ÷ (3 − 8 ÷ 3) is exactly 24, ÷ 0 has no value); the three decks (52 / 52 with sixteen 10s / 40 without J Q K); the solver on 10 hard and 5 impossible hands, and on all 1820 hands of 1-13 (1362 can make 24, the known count, and each answer it writes checks as correct); 300 deals per deck are 4 different cards that can make 24; 39 heard answers in Chinese words, English words and symbols (brackets said, said as 括号 twice, last one dropped, not said at all; J Q K and 尖 勾 圈 老K; "for" and "ate"; "= 24" / 等于二十四 at the end; wrong sums, wrong cards, unreadable); the value of a wrong answer, fractions and ÷ 0; picking the best of the recogniser's alternatives |
| kit | `kit.js` | the test kit: `serve.js` finds files with the folder written five ways, `../` cannot leave the folder, a folder with no `index.html` is refused, `--site` with or without `/` |
| flows | `flows.js` | with a fake microphone and speaker (no real audio): first visit in Chinese (发牌, face-down cards, buttons off); dealing reads the cards in Chinese (zh-CN) and every hand can make 24; heard answers: too few cards, wrong sum with its value, nothing understood, silence, microphone refused, spoken brackets, no brackets; the reply is spoken; score counts and survives a reload; 下一手 deals instead of listening; K and J by name; 答案 shows and reads a solution; the keypad (each card once, ⌫, 检查 off until four cards, missing ")" forgiven); English phone opens in English and reads with en-AU; settings (J Q K = 10, No J Q K over 25 hands, kept after reload); language button; a browser with no recognition opens the keypad; damaged saved settings; at 320×568, 375×812 and 430×932 no scrolling, buttons ≥ 44 px, cards ≥ 60 px wide, keypad fits |
| smoke | `smoke.js` | page loads with no console errors; fits a 375px phone; TEST badge shows `TEST v<version>` off Production and is absent on Production; offline cache is named after `version.js` |

Screenshots go to `<system temp>/Terence_Sun_Make24-tests/`, never into the repo.

Time limits: unit 5 min, smoke 3 min, flows 4 min, any single browser step 20 s. A run that hits one reports `timed out` as a failure; it never hangs.
