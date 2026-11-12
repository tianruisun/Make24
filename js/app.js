/* Make 24 page: deals four cards, reads them out loud, listens to the answer and says whether it makes 24.
   Rules live in game.js (self.Make24). Voice uses the browser's Web Speech API; without recognition the keypad is the way in. */
(function () {
  'use strict';
  const M = self.Make24;
  const $ = id => document.getElementById(id);

  const STR = {
    zh: {
      start: '发牌', listen: '🎤 说答案', listening: '正在听…', nextPrimary: '下一手 ➜',
      readAgain: '再读', keypad: '键盘', answer: '答案', next: '下一手', settings: '设置', language: '语言', faces: 'J Q K',
      mode13: 'J Q K = 11 12 13', mode10: 'J Q K = 10', modeNo: '去掉 J Q K', done: '好', close: '关闭', check: '检查',
      backspace: '删除', clear: '清空', langBtn: 'EN', langLabel: 'English',
      cardsIntro: '四张牌：', correct: '对了！', wrongIs: v => `不对，结果是 ${v}`, wrongNone: '不对，这样算不出来',
      useCards: c => `要用这四张牌：${c}`, unclear: '没听清，请再说一遍', noMic: '这个浏览器不能听，请用键盘',
      micDenied: '没有麦克风权限', noSpeech: '没听到声音', micError: '听不到，请再试一次',
      answerIs: '答案：', revealed: '下一手再来', bracketsAdded: '（已加上括号）', said: '听到：', scoreLabel: n => `答对 ${n} 题`,
      suits: { '♠': '黑桃', '♥': '红桃', '♣': '梅花', '♦': '方块' },
      say: r => ({ A: 'A', J: 'J', Q: 'Q', K: 'K' }[r] || r), sep: '，', verbs: { '+': '加', '-': '减', '*': '乘', '/': '除以', '(': '括号', ')': '括号' }
    },
    en: {
      start: 'Deal', listen: '🎤 Say answer', listening: 'Listening…', nextPrimary: 'Next hand ➜',
      readAgain: 'Read again', keypad: 'Keypad', answer: 'Answer', next: 'Next', settings: 'Settings', language: 'Language', faces: 'J Q K',
      mode13: 'J Q K = 11 12 13', mode10: 'J Q K = 10', modeNo: 'No J Q K', done: 'Done', close: 'Close', check: 'Check',
      backspace: 'Delete', clear: 'Clear', langBtn: '中', langLabel: '中文',
      cardsIntro: 'Your cards: ', correct: 'Correct!', wrongIs: v => `Not quite, that makes ${v}`, wrongNone: 'Not quite, that cannot be worked out',
      useCards: c => `Use these four cards: ${c}`, unclear: "Sorry, I didn't catch that", noMic: 'This browser cannot listen. Use the keypad.',
      micDenied: 'No microphone permission', noSpeech: 'No speech heard', micError: 'Could not listen, please try again',
      answerIs: 'Answer: ', revealed: 'Try the next hand', bracketsAdded: '(brackets added)', said: 'Heard: ', scoreLabel: n => `${n} solved`,
      suits: { '♠': 'spades', '♥': 'hearts', '♣': 'clubs', '♦': 'diamonds' },
      say: r => ({ A: 'ace', J: 'jack', Q: 'queen', K: 'king' }[r] || r), sep: ', ', verbs: { '+': 'plus', '-': 'minus', '*': 'times', '/': 'divided by', '(': 'open bracket', ')': 'close bracket' }
    }
  };

  /* ---------- saved settings (keys start with make24) ---------- */
  function load(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (e) { return fallback; } }
  function save(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode: keep going */ } }
  const settings = Object.assign({ lang: /^zh/i.test(navigator.language || '') ? 'zh' : 'en', mode: '13' }, load('make24.settings', {}));
  if (!STR[settings.lang]) settings.lang = 'zh';
  if (!M.DECK_MODES.includes(settings.mode)) settings.mode = '13';
  const stats = Object.assign({ solved: 0 }, load('make24.stats', {}));

  const state = { hand: null, done: false, listening: false, kp: [] };
  const T = () => STR[settings.lang];
  const voiceLang = () => settings.lang === 'zh' ? 'zh-CN' : (/^en/i.test(navigator.language || '') ? navigator.language : 'en-US');

  /* ---------- voice out ---------- */
  function speak(text) {
    const synth = self.speechSynthesis;
    if (!synth || !self.SpeechSynthesisUtterance) return Promise.resolve();
    synth.cancel();
    return new Promise(resolve => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = voiceLang();
      const want = voiceLang().toLowerCase(), short = want.slice(0, 2);
      const voices = synth.getVoices() || [];
      u.voice = voices.find(v => v.lang && v.lang.toLowerCase().replace('_', '-') === want) ||
        voices.find(v => v.lang && v.lang.toLowerCase().startsWith(short)) || null;
      u.rate = 0.95;
      u.onend = u.onerror = () => resolve();
      synth.speak(u);
      setTimeout(resolve, 12000);   // some browsers never fire onend
    });
  }
  const cardWords = hand => hand.map(c => T().say(c.rank)).join(T().sep);
  const readCards = () => state.hand && speak(T().cardsIntro + cardWords(state.hand));

  /* ---------- voice in ---------- */
  const Recognition = self.SpeechRecognition || self.webkitSpeechRecognition;
  let rec = null;
  function listen() {
    if (!Recognition) { showVerdict('info', T().noMic); openKeypad(); return; }
    if (state.listening) { rec && rec.stop(); return; }
    if (self.speechSynthesis) self.speechSynthesis.cancel();   // never listen to our own voice
    rec = new Recognition();
    rec.lang = voiceLang();
    rec.interimResults = true;
    rec.maxAlternatives = 5;
    rec.continuous = false;
    let finalTexts = null;
    rec.onresult = e => {
      const r = e.results[e.results.length - 1];
      const texts = Array.from(r).map(a => a.transcript);
      if (r.isFinal) finalTexts = texts;
      else { $('heard').textContent = texts[0]; $('heard').className = 'heard live'; }
    };
    rec.onerror = e => {
      const msg = e.error === 'not-allowed' || e.error === 'service-not-allowed' ? T().micDenied : e.error === 'no-speech' ? T().noSpeech : T().micError;
      if (e.error !== 'aborted') showVerdict('info', msg);
    };
    rec.onend = () => {
      setListening(false);
      if (finalTexts) judge(finalTexts);
    };
    try { rec.start(); setListening(true); showVerdict('', ''); $('heard').textContent = ''; }
    catch (e) { setListening(false); showVerdict('info', T().micError); }
  }
  function setListening(on) {
    state.listening = on;
    renderPrimary();
  }

  /* ---------- judging ---------- */
  function judge(texts) {
    if (!state.hand || state.done) return;
    const r = M.checkAny(texts, state.hand.map(c => c.value), settings.mode);
    const heard = $('heard');
    heard.className = 'heard';
    if (r.status === 'correct') {
      heard.textContent = r.expr + ' = 24';
      state.done = true;
      stats.solved++;
      save('make24.stats', stats);
      showVerdict('correct', T().correct + (r.bracketsAdded ? ' ' + T().bracketsAdded : ''));
      speak(T().correct);
    } else if (r.status === 'wrong') {
      heard.textContent = r.expr + (r.value != null ? ' = ' + r.value : '');
      const msg = r.value != null ? T().wrongIs(r.value) : T().wrongNone;
      showVerdict('wrong', msg);
      speak(msg);
    } else if (r.status === 'cards') {
      heard.textContent = r.expr;
      const msg = T().useCards(cardWords(state.hand));
      showVerdict('wrong', msg);
      speak(msg);
    } else {
      heard.textContent = r.heard ? T().said + r.heard : '';
      showVerdict('wrong', T().unclear);
      speak(T().unclear);
    }
    render();
  }
  function showVerdict(kind, text) { const v = $('verdict'); v.className = 'verdict ' + kind; v.textContent = text; }

  /* ---------- dealing ---------- */
  function newHand() {
    if (rec && state.listening) rec.abort();
    state.hand = M.deal(settings.mode);
    state.done = false;
    $('heard').textContent = ''; $('heard').className = 'heard';
    showVerdict('', '');
    render();
    readCards();
  }
  function showAnswer() {
    if (!state.hand) return;
    const s = M.solve(state.hand.map(c => c.value));
    $('heard').textContent = s + ' = 24'; $('heard').className = 'heard';
    state.done = true;
    showVerdict('info', T().revealed);
    speak(T().answerIs + spoken(s));
    render();
  }
  /* "8 ÷ (3 − 8 ÷ 3)" in words, so the voice reads the operators the way people say them. */
  function spoken(expr) {
    const v = T().verbs;
    return expr.replace(/[+−×÷()]/g, ch => ' ' + v[{ '+': '+', '−': '-', '×': '*', '÷': '/', '(': '(', ')': ')' }[ch]] + ' ').replace(/\s+/g, ' ').trim();
  }

  /* ---------- keypad ---------- */
  function openKeypad() {
    if (!state.hand || state.done) return;
    state.kp = [];
    renderKeypad();
    if (!$('keypad').open) $('keypad').showModal();
  }
  function kpText() { return state.kp.map(k => typeof k === 'number' ? String(state.hand[k].value) : k).join(' '); }
  function renderKeypad() {
    const shown = state.kp.map(k => typeof k === 'number' ? String(state.hand[k].value) : { '*': '×', '/': '÷', '-': '−' }[k] || k).join(' ');
    $('kpExpr').textContent = shown;
    const box = $('kpCards');
    box.textContent = '';
    state.hand.forEach((c, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = c.rank;
      b.className = isRed(c) ? 'red' : '';
      b.setAttribute('aria-label', cardLabel(c));
      b.disabled = state.kp.includes(i);
      b.onclick = () => { state.kp.push(i); renderKeypad(); };
      box.appendChild(b);
    });
    $('kpCheck').disabled = state.kp.filter(k => typeof k === 'number').length !== 4;
  }
  document.querySelectorAll('.kp-ops button').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.k;
    if (k === 'back') state.kp.pop();
    else if (k === 'clear') state.kp = [];
    else state.kp.push(k);
    renderKeypad();
  }));
  $('kpCheck').addEventListener('click', () => { const t = kpText(); $('keypad').close(); judge([t]); });

  /* ---------- drawing ---------- */
  const isRed = c => c.suit === '♥' || c.suit === '♦';
  const cardLabel = c => settings.lang === 'zh' ? T().suits[c.suit] + ' ' + c.rank : `${T().say(c.rank)} of ${T().suits[c.suit]}`;
  function render() {
    const box = $('cards');
    if (box.dataset.hand !== handKey()) {
      box.dataset.hand = handKey();
      box.textContent = '';
      (state.hand || [null, null, null, null]).forEach(c => {
        const el = document.createElement('div');
        if (!c) { el.className = 'card back'; el.setAttribute('aria-hidden', 'true'); box.appendChild(el); return; }
        el.className = 'card' + (isRed(c) ? ' red' : '');
        el.setAttribute('role', 'img');
        el.setAttribute('aria-label', cardLabel(c));
        el.innerHTML = `<span class="corner">${c.rank}<br>${c.suit}</span><span class="big">${c.rank}</span><span class="corner br">${c.rank}<br>${c.suit}</span>`;
        box.appendChild(el);
      });
    }
    const has = !!state.hand;
    $('speakBtn').disabled = !has;
    $('keypadBtn').disabled = !has || state.done;
    $('answerBtn').disabled = !has || state.done;
    $('nextBtn').disabled = !has;
    $('score').textContent = stats.solved ? '✓ ' + stats.solved : '';
    $('score').setAttribute('aria-label', T().scoreLabel(stats.solved));
    renderPrimary();
  }
  const handKey = () => state.hand ? state.hand.map(c => c.rank + c.suit).join() + settings.lang : 'none' + settings.lang;
  function renderPrimary() {
    const b = $('primaryBtn');
    b.classList.toggle('listening', state.listening);
    b.textContent = !state.hand ? T().start : state.listening ? T().listening : state.done ? T().nextPrimary : T().listen;
  }
  function applyLanguage() {
    document.documentElement.lang = settings.lang === 'zh' ? 'zh-CN' : 'en';
    document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = T()[el.dataset.i18n]; });
    document.querySelectorAll('[data-i18n-label]').forEach(el => el.setAttribute('aria-label', T()[el.dataset.i18nLabel]));
    $('langBtn').textContent = T().langBtn;
    $('langBtn').setAttribute('aria-label', T().langLabel);
    render();
  }

  /* ---------- wiring ---------- */
  $('primaryBtn').addEventListener('click', () => {
    if (!state.hand || (state.done && !state.listening)) newHand();
    else listen();
  });
  $('speakBtn').addEventListener('click', readCards);
  $('keypadBtn').addEventListener('click', openKeypad);
  $('answerBtn').addEventListener('click', showAnswer);
  $('nextBtn').addEventListener('click', newHand);
  $('langBtn').addEventListener('click', () => { settings.lang = settings.lang === 'zh' ? 'en' : 'zh'; save('make24.settings', settings); applyLanguage(); });
  $('settingsBtn').addEventListener('click', () => {
    document.querySelectorAll('#settings input').forEach(i => { i.checked = settings[i.name] === i.value; });
    $('settings').showModal();
  });
  $('settings').addEventListener('change', e => {
    const i = e.target;
    if (!i.checked) return;
    const changedMode = i.name === 'mode' && settings.mode !== i.value;
    settings[i.name] = i.value;
    save('make24.settings', settings);
    applyLanguage();
    if (changedMode && state.hand) { state.hand = null; state.done = false; $('heard').textContent = ''; showVerdict('', ''); render(); }
  });

  applyLanguage();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  self.Make24App = { judge, state, settings };   // for the browser tests
})();
