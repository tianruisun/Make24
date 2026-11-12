# Make24 (folder Terence_Sun_Make24)

Make 24 (24点): the classic Chinese card game. The phone deals and reads out four cards, the player says how to make
24 with + − × ÷ and brackets, and the phone listens and says whether it is right.

## Environments
- Production: https://tianrui-make24.pages.dev   (branch main)
- Test:       https://test.tianrui-make24.pages.dev   (branch test)
- Cloudflare Pages project name `tianrui-make24` (make24.pages.dev is taken). Not created yet: Terry does NEW_REPO_SETUP.md Part 2.
- GitHub: https://github.com/tianruisun/Make24 (public). Local folder: `D:\VibeCodingProjects\Terence_Sun_Make24`.

## Tech
- Plain HTML/CSS/JS, no build step. Cloudflare build settings: preset None, no build command, output `/`.
- Version lives in: `version.js` (also names the offline cache `make24-<version>`, and lists the Production hosts)
- `js/game.js` holds the rules (decks, solver, exact fractions, reading a spoken answer) with no page, unit-tested in Node.
- Voice: the browser's Web Speech API. speechSynthesis reads the cards; SpeechRecognition (Chrome: Google's service, Safari: Apple's) hears the answer. No server of our own, no key. Browsers without recognition (Firefox) use the keypad.
- Saved in this browser only: `make24.settings` (language, deck) and `make24.stats` (hands solved).

## Tests
- Run all: `npm test`
- Run against Test site: `npm test -- --site=https://test.tianrui-make24.pages.dev`
- Every run ends within its time limits (unit 5 min, smoke 3 min, flows 4 min, any single browser step 20 s).

## Project rules (override the master rules)
- Languages: 中文 (Mandarin) and English, for the screen and for the voice.
- localStorage keys and cache names start with this app's own prefix (`make24`).
- **Not in the shared auto-review loop** (Terry, 2026-11-12: "Manual, take it out of the loop"; marker file
  `_Review\Terence_Sun_Make24_review\manual-review.txt`). After writing an `R<n>` block, do **not** run `review-now.js`.
  Claude starts Hermes itself, outside the loop (Terry, 2026-11-12: "send the review to Hermes to review, okay? I'm not
  going to review by hand"): `"%LOCALAPPDATA%\hermes\bin\hermes.exe" --in D:\VibeCodingProjects -z "Review changes in Terence_Sun_Make24"`,
  in the background, output to `_automation\logs\<time>-Terence_Sun_Make24-hermes-direct.txt`. Commit before starting it,
  and change nothing in the repo or the release file while it runs. Then read its FINDINGS and tell Terry.
- The standing decision of 2026-11-11 (push to Test when only low findings are left) does **not** apply here. Test, like
  Production, needs Terry's own "push to test" in the chat.
