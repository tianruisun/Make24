/* Browser flows: deal, read out, listen, judge, keypad, answer, settings, language, phone sizes.
   The browser's speech is replaced by a fake before the page loads: spoken text is recorded in window.__spoken, and
   the fake recogniser "hears" whatever the test puts in window.__nextHeard (a list of alternatives), or raises
   window.__nextError. So the flows never need a microphone or a speaker, and run the same on Test and Production.
   window.__script plays a continuous session like a real phone: each step comes "after" ms, with the recogniser's whole
   result list so far ([[alternatives], ...], each marked final or not), and the session only ends when the app stops it. */
const fs = require('fs'), os = require('os'), path = require('path');
const { launch } = require('./smoke.js');

const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(os.tmpdir(), path.basename(ROOT) + '-tests');

const FAKE_SPEECH = `
  window.__spoken = [];
  window.__nextHeard = null; window.__nextError = null; window.__recLang = null; window.__recStarts = 0;
  window.__script = null; window.__recStops = 0; window.__recContinuous = null;
  class FakeUtterance { constructor(t) { this.text = t; } }
  window.SpeechSynthesisUtterance = FakeUtterance;
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
    speak(u) { window.__spoken.push({ text: u.text, lang: u.lang }); setTimeout(() => u.onend && u.onend(), 5); },
    cancel() {}, getVoices() { return []; }
  }});
  class FakeRec {
    start() {
      window.__recLang = this.lang; window.__recStarts++; window.__recContinuous = this.continuous;
      if (window.__script) {
        const script = window.__script; window.__script = null;
        let at = 0;
        this.__timers = script.map(step => setTimeout(() => {
          if (this.__ended) return;
          const results = step.results.map(alts => { const r = alts.map(t => ({ transcript: t })); r.isFinal = !!step.final; return r; });
          this.onresult && this.onresult({ results });
        }, at += step.after));
        return;
      }
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
    end() { if (this.__ended) return; this.__ended = true; (this.__timers || []).forEach(clearTimeout); this.onend && this.onend(); }
    stop() { window.__recStops++; if (this.__timers) setTimeout(() => this.end(), 20); }
    abort() { if (this.__timers) this.end(); else this.onend && this.onend(); }
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
    await page.click('#langBtn');
    check('R1.4: switching to English re-says the verdict in English, the sum stays',
      (await text(page, '#verdict')) === 'Not quite, that makes 22' && (await text(page, '#heard')) === '8 + 3 + 8 + 3 = 22', await text(page, '#verdict'));
    await page.click('#langBtn');
    check('R1.4: and back to 中文', (await text(page, '#verdict')) === '不对，结果是 22', await text(page, '#verdict'));

    r = await say(page, '');
    check('zh: an empty transcript → 没听到声音', r.verdict === '没听到声音', r);
    r = await say(page, '嗯');
    check('zh: nothing understood → 没听清', r.verdict === '没听清，请再说一遍', r);
    r = await say(page, '8*3+');
    check('R1.8: unreadable text is shown with × ÷ like the rest of the page', r.heard === '听到：8×3+' && r.verdict === '没听清，请再说一遍', r);
    r = await say(page, '嗯，那个，八加三加八加三');
    check('R1.7: filler words are ignored, the sum is still judged', r.verdict === '不对，结果是 22', r);

    await page.evaluate(() => { window.__nextError = 'no-speech'; });
    await page.click('#primaryBtn');
    await page.waitForTimeout(150);
    check('zh: silence → 没听到声音', (await text(page, '#verdict')) === '没听到声音');
    await page.evaluate(() => { window.__nextError = 'not-allowed'; });
    await page.click('#primaryBtn');
    await page.waitForTimeout(150);
    check('R1.3: microphone refused → 没有麦克风权限，请用键盘', (await text(page, '#verdict')) === '没有麦克风权限，请用键盘', await text(page, '#verdict'));
    check('R1.3: microphone refused → the keypad opens', await page.$eval('#keypad', d => d.open));
    await page.click('#keypad button[value="cancel"]');

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
    /* R1.1: a typed sum that does not read stays, with a keypad message, not "没听清" */
    const verdictBefore = await text(page, '#verdict');
    await kp('+'); await kpCard(0); await kp('+'); await kpCard(1); await kp('*'); await kpCard(2); await kp('+'); await kpCard(3); await kp('-');
    await page.click('#kpCheck');
    await page.waitForTimeout(80);
    check('R1.1: an unfinished sum keeps the keypad open', await page.$eval('#keypad', d => d.open));
    check('R1.1: it says the sum is not complete', (await text(page, '#kpMsg')) === '算式还没写完整：检查运算符和括号', await text(page, '#kpMsg'));
    check('R1.1: the typed sum is kept', (await text(page, '#kpExpr')) === '+ 8 + 3 × 8 + 3 −', await text(page, '#kpExpr'));
    check('R1.1: the page verdict is not touched (no 没听清)', (await text(page, '#verdict')) === verdictBefore, await text(page, '#verdict'));
    await kp('back');
    check('R1.1: the message goes once the sum is changed', (await text(page, '#kpMsg')) === '');
    await page.click('#keypad button[value="cancel"]');
    await page.click('#keypadBtn');
    check('R1.1: closing and reopening keeps the sum', (await text(page, '#kpExpr')) === '+ 8 + 3 × 8 + 3', await text(page, '#kpExpr'));
    await kp('clear');
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

    /* R1.6: the score can be reset, after a question that says it cannot be undone; R1.5: the settings say where the voice goes */
    await page.click('#settingsBtn');
    check('R1.6: reset shows the score', (await text(page, '#resetScore')) === '清零（答对 4 题）', await text(page, '#resetScore'));
    check('R1.5: settings say Chrome sends the sound to Google', (await text(page, '#settings .note')).includes('Google'));
    let asked = '';
    page.once('dialog', d => { asked = d.message(); d.dismiss(); });
    await page.click('#resetScore');
    check('R1.6: reset asks first, with the consequence', asked === '把答对的 4 题清零？清零后不能恢复。', asked);
    check('R1.6: Cancel keeps the score', (await text(page, '#score')) === '✓ 4', await text(page, '#score'));
    page.once('dialog', d => d.accept());
    await page.click('#resetScore');
    await page.waitForTimeout(50);
    check('R1.6: OK clears it, on screen and saved', (await text(page, '#score')) === '' && (await page.evaluate(() => localStorage.getItem('make24.stats'))) === '{"solved":0}');
    check('R1.6: reset is off at 0', await page.$eval('#resetScore', b => b.disabled));
    check('R1.5: apple-touch-icon is linked', !!(await page.$('link[rel="apple-touch-icon"][href="icons/icon-180.png"]')));
    await page.click('#settings button[value="ok"]');
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

    /* ---------- R3: answers in steps, with pauses (Terry, 2026-11-13) ---------- */
    ({ context, page, errors } = await open({ lang: 'zh-CN' }));
    async function play(page, script, { tapAfter = 0 } = {}) {
      await page.evaluate(sc => { window.__script = sc; }, script);
      await page.click('#primaryBtn');
      if (tapAfter) { await page.waitForTimeout(tapAfter); await page.click('#primaryBtn'); }
      const t0 = Date.now();
      await page.waitForFunction(() => !window.Make24App.state.listening, null, { timeout: 15000 });
      await page.waitForTimeout(50);
      return Object.assign(await page.evaluate(() => ({
        heard: document.getElementById('heard').textContent, verdict: document.getElementById('verdict').textContent,
        spoken: window.__spoken.map(s => s.text), continuous: window.__recContinuous
      })), { ms: Date.now() - t0 });
    }
    await forceHand(page, [['9', '♠'], ['6', '♥'], ['8', '♣'], ['A', '♦']]);
    r = await play(page, [
      { after: 100, results: [['9减6等于3']], final: false },
      { after: 100, results: [['9减6等于3']], final: true },
      { after: 2000, results: [['9减6等于3'], ['3乘以8等于24']], final: false },     // a 2-second pause between steps
      { after: 100, results: [['9减6等于3'], ['3乘以8等于24，再乘以1等于24']], final: true }
    ]);
    check('R3: listening is continuous', r.continuous === true, r.continuous);
    check('R3: "9减6等于3 … 3乘以8等于24，再乘以1" after a pause → 对了', r.verdict === '对了！' && r.heard === '9 − 6 = 3; 3 × 8 = 24; 24 × 1 = 24', r);
    check('R3: a right answer ends listening by itself, soon after', r.ms < 4500, r.ms);

    await forceHand(page, [['9', '♠'], ['6', '♥'], ['8', '♣'], ['A', '♦']]);
    r = await play(page, [
      { after: 100, results: [['九减六等于四']], final: true },
      { after: 300, results: [['九减六等于四'], ['四乘以八乘一等于三十二']], final: true }
    ]);
    check('R3: a wrong step is named: 这一步不对：结果是 3，不是 4', r.verdict === '这一步不对：结果是 3，不是 4' && r.heard === '9 − 6 = 3', r);
    check('R3: and it is spoken', r.spoken[r.spoken.length - 1] === '这一步不对：结果是 3，不是 4', r.spoken.slice(-1));
    check('R3: an unfinished answer waits for a quiet spell (about 3.5 s) before judging', r.ms >= 3000 && r.ms < 6000, r.ms);

    await forceHand(page, [['9', '♠'], ['6', '♥'], ['8', '♣'], ['A', '♦']]);
    r = await play(page, [
      { after: 100, results: [['九减六']], final: false },
      { after: 200, results: [['九减六成八成一']], final: false }               // never marked final (Safari)
    ], { tapAfter: 450 });
    check('R3: Safari-style results never marked final are still judged when the player taps', r.verdict.startsWith('对了'), r);
    check('R3: sound-alike 成 is read as 乘', r.heard.startsWith('(9 − 6) × 8 × 1'), r.heard);

    await forceHand(page, [['9', '♠'], ['6', '♥'], ['8', '♣'], ['A', '♦']]);
    r = await play(page, [
      { after: 100, results: [['9减6等于3']], final: true },
      { after: 300, results: [['9减6等于3'], ['9减6等于3 3乘8等于24 乘1等于24']], final: true }   // Chrome on Android repeats
    ]);
    check('R3: a piece that repeats the earlier one is not counted twice', r.verdict === '对了！' && r.heard === '9 − 6 = 3; 3 × 8 = 24; 24 × 1 = 24', r);

    await forceHand(page, [['9', '♠'], ['6', '♥'], ['8', '♣'], ['A', '♦']]);
    await page.evaluate(() => { window.__script = [{ after: 100, results: [['九减六乘以八乘以一']], final: false }]; });
    await page.click('#primaryBtn');
    check('R3: the button says how to stop: 正在听… 说完点这里', (await text(page, '#primaryBtn')) === '正在听… 说完点这里', await text(page, '#primaryBtn'));
    await page.waitForTimeout(50);
    await page.click('#nextBtn');
    await page.waitForTimeout(1200);
    check('R3: a new hand while listening stops it, and nothing is judged on the new hand',
      !(await page.evaluate(() => window.Make24App.state.listening)) && (await text(page, '#verdict')) === '' && (await text(page, '#score')) === '✓ 3', await text(page, '#verdict'));

    check('R3: no page errors', errors.length === 0, errors);
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
      await page.click('#keypad button[value="cancel"]');
      await page.click('#settingsBtn');
      const st = await page.$eval('#settings', d => { const b = d.getBoundingClientRect(), ok = d.querySelector('button[value="ok"]').getBoundingClientRect();
        return { inside: b.left >= 0 && b.right <= innerWidth && b.top >= 0 && b.bottom <= innerHeight, side: d.scrollWidth > d.clientWidth, ok: ok.height >= 44 && ok.top >= b.top && ok.bottom <= Math.min(b.bottom, innerHeight) }; });
      check(`${w}×${h}: settings fit the screen (scrolls inside if tall), Done always visible, no sideways scroll`, st.inside && !st.side && st.ok, st);
      await page.screenshot({ path: path.join(SHOTS, `settings-${w}.png`) });
      await page.click('#settings button[value="ok"]');
      await page.screenshot({ path: path.join(SHOTS, `size-${w}.png`) });
      await context.close();
    }
  } finally {
    await browser.close();
  }
  return { pass, fail };
}

module.exports = { run };
