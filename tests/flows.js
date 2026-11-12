/* Browser flows: deal, read out, listen, judge, keypad, answer, settings, language, phone sizes.
   The browser's speech is replaced by a fake before the page loads: spoken text is recorded in window.__spoken, and
   the fake recogniser "hears" whatever the test puts in window.__nextHeard (a list of alternatives), or raises
   window.__nextError. So the flows never need a microphone or a speaker, and run the same on Test and Production. */
const fs = require('fs'), os = require('os'), path = require('path');
const { launch } = require('./smoke.js');

const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(os.tmpdir(), path.basename(ROOT) + '-tests');

const FAKE_SPEECH = `
  window.__spoken = [];
  window.__nextHeard = null; window.__nextError = null; window.__recLang = null; window.__recStarts = 0;
  class FakeUtterance { constructor(t) { this.text = t; } }
  window.SpeechSynthesisUtterance = FakeUtterance;
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
    speak(u) { window.__spoken.push({ text: u.text, lang: u.lang }); setTimeout(() => u.onend && u.onend(), 5); },
    cancel() {}, getVoices() { return []; }
  }});
  class FakeRec {
    start() {
      window.__recLang = this.lang; window.__recStarts++;
      setTimeout(() => {
        if (window.__nextError) { const e = window.__nextError; window.__nextError = null; this.onerror && this.onerror({ error: e }); this.onend && this.onend(); return; }
        const alts = window.__nextHeard || [];
        window.__nextHeard = null;
        if (alts.length) {
          const interim = [{ transcript: alts[0] }]; interim.isFinal = false;
          this.onresult && this.onresult({ results: [interim] });
          const fin = alts.map(t => ({ transcript: t })); fin.isFinal = true;
          this.onresult && this.onresult({ results: [fin] });
        }
        this.onend && this.onend();
      }, 30);
    }
    stop() {} abort() { this.onend && this.onend(); }
  }
  window.SpeechRecognition = FakeRec; window.webkitSpeechRecognition = FakeRec;
`;

async function run(site) {
  fs.mkdirSync(SHOTS, { recursive: true });
  let pass = 0, fail = 0;
  const check = (name, ok, detail) => { ok ? pass++ : fail++; if (!ok) console.log('FAIL flows:', name, detail === undefined ? '' : JSON.stringify(detail)); };

  const browser = await launch();
  async function open({ lang = 'zh-CN', width = 375, height = 812, speech = true, storage = null } = {}) {
    const context = await browser.newContext({ viewport: { width, height }, locale: lang, serviceWorkers: 'block' });
    context.setDefaultTimeout(20000);
    if (speech) await context.addInitScript(FAKE_SPEECH);
    else await context.addInitScript(`delete window.SpeechRecognition; delete window.webkitSpeechRecognition;
      Object.defineProperty(window, 'SpeechRecognition', { value: undefined }); Object.defineProperty(window, 'webkitSpeechRecognition', { value: undefined });`);
    if (storage) await context.addInitScript(`try { ${Object.entries(storage).map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join('')} } catch (e) {}`);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(site, { waitUntil: 'load' });
    return { context, page, errors };
  }
  async function forceHand(page, cards) {
    // Deal normally, then replace the hand and redraw, without changing any rule.
    await page.evaluate(cards => {
      const A = window.Make24App, M = window.Make24;
      const realDeal = M.deal;
      M.deal = () => cards.map(([rank, suit]) => ({ rank, suit, value: M.rankValue(rank, A.settings.mode) }));
      document.getElementById(A.state.hand ? 'nextBtn' : 'primaryBtn').click();
      M.deal = realDeal;
    }, cards);
    await page.waitForTimeout(80);
  }
  async function say(page, ...alts) {
    await page.evaluate(a => { window.__nextHeard = a; }, alts);
    await page.click('#primaryBtn');
    await page.waitForFunction(() => !window.Make24App.state.listening, null, { timeout: 5000 });
    await page.waitForTimeout(50);
    return page.evaluate(() => ({
      heard: document.getElementById('heard').textContent, verdict: document.getElementById('verdict').textContent,
      kind: document.getElementById('verdict').className, primary: document.getElementById('primaryBtn').textContent,
      spoken: window.__spoken.map(s => s.text), score: document.getElementById('score').textContent
    }));
  }
  const text = (page, sel) => page.$eval(sel, el => el.textContent.trim());

  try {
    /* ---------- first visit in Chinese ---------- */
    let { context, page, errors } = await open({ lang: 'zh-CN' });
    check('zh: first button is 发牌', (await text(page, '#primaryBtn')) === '发牌', await text(page, '#primaryBtn'));
    check('zh: four face-down cards before dealing', (await page.$$('#cards .card.back')).length === 4);
    check('zh: action buttons off before dealing', await page.$eval('#answerBtn', b => b.disabled) && await page.$eval('#keypadBtn', b => b.disabled));
    check('zh: page language zh-CN', (await page.getAttribute('html', 'lang')) === 'zh-CN');

    await page.click('#primaryBtn');
    await page.waitForTimeout(100);
    const dealt = await page.$$eval('#cards .card:not(.back)', els => els.map(e => e.getAttribute('aria-label')));
    check('zh: dealing shows 4 cards with names', dealt.length === 4 && dealt.every(l => /^(黑桃|红桃|梅花|方块) (A|[2-9]|10|J|Q|K)$/.test(l)), dealt);
    const spoken1 = await page.evaluate(() => window.__spoken[window.__spoken.length - 1]);
    check('zh: the cards are read out in Chinese', spoken1 && spoken1.text.startsWith('四张牌：') && spoken1.lang === 'zh-CN', spoken1);
    const handVals = await page.evaluate(() => window.Make24App.state.hand.map(c => c.value));
    check('zh: the dealt hand can make 24', await page.evaluate(v => !!window.Make24.solve(v), handVals), handVals);
    check('zh: button becomes 说答案', (await text(page, '#primaryBtn')).includes('说答案'));

    await forceHand(page, [['8', '♠'], ['3', '♥'], ['8', '♣'], ['3', '♦']]);
    const read = await page.evaluate(() => window.__spoken[window.__spoken.length - 1].text);
    check('zh: reads "四张牌：8，3，8，3"', read === '四张牌：8，3，8，3', read);

    let r = await say(page, '八除以三');
    check('zh: listens in zh-CN', (await page.evaluate(() => window.__recLang)) === 'zh-CN');
    check('zh: too few cards → asks to use the four cards', r.verdict.startsWith('要用这四张牌') && r.kind.includes('wrong'), r);
    check('zh: the reply is spoken', r.spoken[r.spoken.length - 1].startsWith('要用这四张牌'), r.spoken.slice(-1));

    r = await say(page, '八加三加八加三');
    check('zh: wrong sum → 不对，结果是 22', r.verdict === '不对，结果是 22' && r.heard === '8 + 3 + 8 + 3 = 22', r);
    check('zh: no point for a wrong answer', r.score === '', r.score);

    r = await say(page, '');
    check('zh: nothing understood → 没听清', r.verdict === '没听清，请再说一遍', r);

    await page.evaluate(() => { window.__nextError = 'no-speech'; });
    await page.click('#primaryBtn');
    await page.waitForTimeout(150);
    check('zh: silence → 没听到声音', (await text(page, '#verdict')) === '没听到声音');
    await page.evaluate(() => { window.__nextError = 'not-allowed'; });
    await page.click('#primaryBtn');
    await page.waitForTimeout(150);
    check('zh: microphone refused → 没有麦克风权限', (await text(page, '#verdict')) === '没有麦克风权限');

    r = await say(page, '八除以括号三减八除以三括号');
    check('zh: spoken brackets, right answer → 对了', r.verdict === '对了！' && r.heard === '8 ÷ (3 − 8 ÷ 3) = 24', r);
    check('zh: correct is spoken', r.spoken[r.spoken.length - 1] === '对了！', r.spoken.slice(-1));
    check('zh: score shows ✓ 1', r.score === '✓ 1', r.score);
    check('zh: button becomes 下一手', r.primary.includes('下一手'), r.primary);
    check('zh: Answer and Keypad off after solving', await page.$eval('#answerBtn', b => b.disabled) && await page.$eval('#keypadBtn', b => b.disabled));
    await page.screenshot({ path: path.join(SHOTS, 'zh-correct.png') });

    const starts = await page.evaluate(() => window.__recStarts);
    await page.click('#primaryBtn');
    await page.waitForTimeout(100);
    check('zh: 下一手 deals a new hand instead of listening', (await page.evaluate(() => window.__recStarts)) === starts &&
      (await text(page, '#primaryBtn')).includes('说答案') && (await text(page, '#verdict')) === '');

    await forceHand(page, [['8', '♠'], ['3', '♥'], ['8', '♣'], ['3', '♦']]);
    r = await say(page, '八除以三减八除以三');
    check('zh: no brackets spoken but some bracketing works → 对了 (括号已加)', r.verdict.startsWith('对了') && r.verdict.includes('括号') && r.heard === '8 ÷ (3 − 8 ÷ 3) = 24', r);
    check('zh: score kept as ✓ 2 after reload', await (async () => { await page.reload(); await page.waitForTimeout(100); return (await text(page, '#score')) === '✓ 2'; })());

    /* recogniser alternatives: the right one among five wins */
    await forceHand(page, [['K', '♠'], ['J', '♥'], ['A', '♣'], ['A', '♦']]);
    r = await say(page, 'K加J加一减一', 'k 加 j 加 1 减 1');
    check('zh: K and J by name count 13 and 11', r.verdict === '对了！', r);

    /* answer */
    await forceHand(page, [['5', '♠'], ['5', '♥'], ['5', '♣'], ['A', '♦']]);
    await page.click('#answerBtn');
    await page.waitForTimeout(80);
    check('zh: 答案 shows a solution of these cards', (await text(page, '#heard')) === '5 × (5 − 1 ÷ 5) = 24', await text(page, '#heard'));
    const ans = await page.evaluate(() => window.__spoken[window.__spoken.length - 1].text);
    check('zh: the answer is read in words', ans === '答案：5 乘 括号 5 减 1 除以 5 括号', ans);
    check('zh: no point after showing the answer', (await text(page, '#score')) === '✓ 3', await text(page, '#score'));
    check('zh: after the answer the main button deals', (await text(page, '#primaryBtn')).includes('下一手'));

    /* keypad */
    await forceHand(page, [['8', '♠'], ['3', '♥'], ['8', '♣'], ['3', '♦']]);
    await page.click('#keypadBtn');
    check('zh: keypad opens', await page.$eval('#keypad', d => d.open));
    check('zh: 检查 off until all four cards are used', await page.$eval('#kpCheck', b => b.disabled));
    const kp = async k => page.click(`#keypad [data-k="${k}"]`);
    const kpCard = async i => page.click(`#kpCards button:nth-child(${i + 1})`);
    await kpCard(0); await kp('/'); await kp('('); await kpCard(1); await kp('-'); await kpCard(2);
    check('zh: a used card cannot be used again', await page.$eval('#kpCards button:nth-child(1)', b => b.disabled));
    await kp('/'); await kpCard(3); await kp(')');
    check('zh: keypad shows 8 ÷ ( 3 − 8 ÷ 3 )', (await text(page, '#kpExpr')) === '8 ÷ ( 3 − 8 ÷ 3 )', await text(page, '#kpExpr'));
    await kp('back');
    check('zh: ⌫ removes the last key', (await text(page, '#kpExpr')) === '8 ÷ ( 3 − 8 ÷ 3', await text(page, '#kpExpr'));
    await page.click('#kpCheck');
    await page.waitForTimeout(80);
    check('zh: keypad answer judged 对了 (missing ")" forgiven)', (await text(page, '#verdict')) === '对了！', await text(page, '#verdict'));
    check('zh: keypad closes after 检查', !(await page.$eval('#keypad', d => d.open)));
    check('zh: no page errors', errors.length === 0, errors);
    await context.close();

    /* ---------- English, settings, J Q K = 10 ---------- */
    ({ context, page, errors } = await open({ lang: 'en-AU' }));
    check('en: phone in English opens in English (Deal)', (await text(page, '#primaryBtn')) === 'Deal');
    await page.click('#settingsBtn');
    check('en: settings opens', await page.$eval('#settings', d => d.open));
    check('en: settings shows the current choices', await page.$eval('#settings input[value="en"]', i => i.checked) && await page.$eval('#settings input[value="13"]', i => i.checked));
    await page.check('#settings input[value="10"]');
    await page.click('#settings button[value="ok"]');
    await page.click('#primaryBtn');
    await page.waitForTimeout(80);
    const sp = await page.evaluate(() => window.__spoken[window.__spoken.length - 1]);
    check('en: cards read in English with the phone\'s English (en-AU)', sp.text.startsWith('Your cards: ') && sp.lang === 'en-AU', sp);
    await forceHand(page, [['Q', '♠'], ['K', '♥'], ['4', '♣'], ['A', '♦']]);
    const readEn = await page.evaluate(() => window.__spoken[window.__spoken.length - 1].text);
    check('en: face cards read by name', readEn === 'Your cards: queen, king, 4, ace', readEn);
    r = await say(page, 'queen plus king plus four', '10 plus 10 plus 4');
    check('en: with J Q K = 10, 10 + 10 + 4 is wrong (3 cards)', r.verdict.startsWith('Use these four cards'), r);
    r = await say(page, 'queen plus king plus four times ace');
    check('en: queen + king + 4 × ace = 24 when J Q K = 10', r.verdict === 'Correct!' && r.heard === '10 + 10 + 4 × 1 = 24', r);
    check('en: settings kept after reload', await (async () => { await page.reload(); return (await page.evaluate(() => localStorage.getItem('make24.settings'))).includes('"mode":"10"'); })());

    await page.click('#settingsBtn');
    await page.check('#settings input[value="nofaces"]');
    await page.click('#settings button[value="ok"]');
    let faces = 0;
    for (let i = 0; i < 25; i++) {
      await page.click(i === 0 ? '#primaryBtn' : '#nextBtn');
      faces += await page.$$eval('#cards .card', els => els.filter(e => /[JQK]$/.test(e.getAttribute('aria-label') || '')).length);
    }
    check('en: with "No J Q K" 25 hands hold no face card', faces === 0, faces);
    check('en: only make24.* keys stored', (await page.evaluate(() => Object.keys(localStorage))).every(k => k.startsWith('make24.')));

    await page.click('#langBtn');
    check('en → 中: language button switches the page', (await text(page, '#nextBtn')).includes('下一手') && (await page.getAttribute('html', 'lang')) === 'zh-CN');
    check('中: settings button has a Chinese name', (await page.getAttribute('#settingsBtn', 'aria-label')) === '设置');
    check('en: no page errors', errors.length === 0, errors);
    await context.close();

    /* ---------- no speech recognition (e.g. Firefox): the keypad is the way in ---------- */
    ({ context, page, errors } = await open({ lang: 'en-US', speech: false }));
    await page.click('#primaryBtn');
    await page.click('#primaryBtn');
    await page.waitForTimeout(80);
    check('no mic: "Say answer" explains and opens the keypad', (await text(page, '#verdict')).includes('keypad') && await page.$eval('#keypad', d => d.open));
    check('no mic: no page errors', errors.length === 0, errors);
    await context.close();

    /* ---------- damaged storage ---------- */
    ({ context, page, errors } = await open({ storage: { 'make24.settings': '{oops', 'make24.stats': 'null' } }));
    check('damaged settings: page still opens with 发牌', (await text(page, '#primaryBtn')) === '发牌');
    check('damaged settings: no page errors', errors.length === 0, errors);
    await context.close();

    /* ---------- phone sizes ---------- */
    for (const [w, h] of [[320, 568], [375, 812], [430, 932]]) {
      ({ context, page, errors } = await open({ width: w, height: h }));
      await page.click('#primaryBtn');
      await page.waitForTimeout(500);
      const m = await page.evaluate(() => {
        const box = el => el.getBoundingClientRect();
        const btns = [...document.querySelectorAll('.actions button, #primaryBtn, .icon-btn')].map(box);
        const cards = [...document.querySelectorAll('#cards .card')].map(box);
        return {
          sideScroll: document.documentElement.scrollWidth > innerWidth,
          vertScroll: document.documentElement.scrollHeight > innerHeight + 1,
          small: btns.filter(b => b.height < 44 || b.width < 44).length,
          cardsInside: cards.every(c => c.left >= 0 && c.right <= innerWidth),
          cardW: Math.round(cards[0].width)
        };
      });
      check(`${w}×${h}: no sideways scroll`, !m.sideScroll);
      check(`${w}×${h}: everything fits without scrolling`, !m.vertScroll);
      check(`${w}×${h}: buttons at least 44 px`, m.small === 0, m);
      check(`${w}×${h}: cards inside the screen, at least 60 px wide`, m.cardsInside && m.cardW >= 60, m);
      await page.click('#keypadBtn');
      const kpFits = await page.$eval('#keypad', d => { const b = d.getBoundingClientRect(); return b.left >= 0 && b.right <= innerWidth && b.bottom <= innerHeight; });
      check(`${w}×${h}: keypad fits the screen`, kpFits);
      await page.screenshot({ path: path.join(SHOTS, `size-${w}.png`) });
      await context.close();
    }
  } finally {
    await browser.close();
  }
  return { pass, fail };
}

module.exports = { run };
