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

## Tests
- Run all: `npm test`
- Run against Test site: `npm test -- --site=https://test.tianrui-make24.pages.dev`
- Every run ends within its time limits (unit 5 min, smoke 3 min, flows 4 min, any single browser step 20 s).

## Project rules (override the master rules)
- Languages: 中文 (Mandarin) and English, for the screen and for the voice.
- localStorage keys and cache names start with this app's own prefix (`make24`).
