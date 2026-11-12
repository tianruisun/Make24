/* Make 24 page: deals four cards, reads them out loud, listens to the answer and says whether it makes 24.
   Rules live in game.js (self.Make24). Voice uses the browser's Web Speech API; without recognition the keypad is the way in.
   What the result lines show is kept in state.view as message keys, not text, so a language change redraws it (R1.4). */
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
      micDenied: '没有麦克风权限，请用键盘', noSpeech: '没听到声音', micError: '听不到，请再试一次',
      kpUnclear: '算式还没写完整：检查运算符和括号',
      answerIs: '答案：', revealed: '下一手再来', bracketsAdded: '（已加上括号）', said: '听到：', scoreLabel: n => `答对 ${n} 题`,
      score: '成绩', resetScore: n => `清零（答对 ${n} 题）`, resetConfirm: n => `把答对的 ${n} 题清零？清零后不能恢复。`,
      voice: '语音', privacy: '听答案用的是浏览器自带的语音识别：Chrome 会把声音发给 Google，Safari 发给 Apple。',
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
      micDenied: 'No microphone permission. Use the keypad.', noSpeech: 'No speech heard', micError: 'Could not listen, please try again',
      kpUnclear: 'Not a complete sum yet: check the operators and brackets',
      answerIs: 'Answer: ', revealed: 'Try the next hand', bracketsAdded: '(brackets added)', said: 'Heard: ', scoreLabel: n => `${n} solved`,
      score: 'Score', resetScore: n => `Reset (${n} solved)`, resetConfirm: n => `Reset your ${n} solved to 0? This cannot be undone.`,
      voice: 'Voice', privacy: "Answers are heard by the browser's own speech recognition: Chrome sends the sound to Google, Safari to Apple.",
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
  if (!(stats.solved >= 0)) stats.solved = 0;

  const EMPTY = { heard: '', said: false, live: false, kind: '', parts: [] };
  const state = { hand: null, done: false, listening: false, kp: [], view: EMPTY };
  const T = () => STR[settings.lang];
  const voiceLang = () => settings.lang === 'zh' ? 'zh-CN' : (/^en/i.test(navigator.language || '') ? navigator.language : 'en-US');

  /* ---------- the two result lines ---------- */
  /* parts: [[key, ...args]]; an arg that is a function is called when drawn (card names follow the language). */
  function msgText(parts) {
    return parts.map(([k, ...a]) => {
      const v = T()[k], args = a.map(x => typeof x === 'function' ? x() : x);
      return typeof v === 'function' ? v(...args) : v;
    }).join(' ');
  }
  function setView(view) { state.view = Object.assign({}, EMPTY, view); paint(); }
  function setMessage(kind, parts) { state.view = Object.assign({}, state.view, { kind, parts, live: false }); paint(); }
  function paint() {
    const v = state.view;
    $('heard').textContent = (v.said && v.heard ? T().said : '') + v.heard;
    $('heard').className = 'heard' + (v.live ? ' live' : '');
    $('verdict').className = 'verdict ' + v.kind;
    $('verdict').textContent = msgText(v.parts);
  }
  /* Raw recogniser text, with the same × ÷ − the rest of the page uses (R1.8). */
  const tidy = s => String(s).replace(/\*/g, '×').replace(/\//g, '÷').replace(/(\d)\s*-\s*(?=\d)/g, '$1 − ');

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
  const cardWords = () => state.hand ? state.hand.map(c => T().say(c.rank)).join(T().sep) : '';
  const readCards = () => state.hand && speak(T().cardsIntro + cardWords());
  function sayParts(kind, parts) { setMessage(kind, parts); speak(msgText(parts)); }

  /* ---------- voice in ---------- */
  const Recognition = self.SpeechRecognition || self.webkitSpeechRecognition;
  let rec = null;
  function listen() {
    if (!Recognition) { setMessage('info', [['noMic']]); openKeypad(); return; }
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
      else setView({ heard: tidy(texts[0]), live: true });
    };
    rec.onerror = e => {
      if (e.error === 'aborted') return;
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { setMessage('info', [['micDenied']]); openKeypad(); return; }   // R1.3
      setMessage('info', [[e.error === 'no-speech' ? 'noSpeech' : 'micError']]);
    };
    rec.onend = () => {
      setListening(false);
      if (finalTexts) judge(finalTexts);
    };
    try { rec.start(); setListening(true); setView({}); }
    catch (e) { setListening(false); setMessage('info', [['micError']]); }
  }
  function setListening(on) {
    state.listening = on;
    renderPrimary();
  }

  /* ---------- judging ---------- */
  function judge(texts) {
    if (!state.hand || state.done) return null;
    const r = M.checkAny(texts, state.hand.map(c => c.value), settings.mode);
    if (r.status === 'correct') {
      state.done = true;
      stats.solved++;
      save('make24.stats', stats);
      setView({ heard: r.expr + ' = 24', kind: 'correct', parts: r.bracketsAdded ? [['correct'], ['bracketsAdded']] : [['correct']] });
      speak(T().correct);
    } else if (r.status === 'wrong') {
      setView({ heard: r.expr + (r.value != null ? ' = ' + r.value : '') });
      sayParts('wrong', r.value != null ? [['wrongIs', r.value]] : [['wrongNone']]);
    } else if (r.status === 'cards') {
      setView({ heard: r.expr });
      sayParts('wrong', [['useCards', cardWords]]);
    } else {
      setView({ heard: r.heard ? tidy(r.heard) : '', said: true });
      sayParts('wrong', [['unclear']]);
    }
    render();
    return r;
  }

  /* ---------- dealing ---------- */
  function newHand() {
    if (rec && state.listening) rec.abort();
    state.hand = M.deal(settings.mode);
    state.done = false;
    state.kp = [];
    setView({});
    render();
    readCards();
  }
  function showAnswer() {
    if (!state.hand) return;
    const s = M.solve(state.hand.map(c => c.value));
    state.done = true;
    setView({ heard: s + ' = 24', kind: 'info', parts: [['revealed']] });
    speak(T().answerIs + spoken(s));
    render();
  }
  /* "8 ÷ (3 − 8 ÷ 3)" in words, so the voice reads the operators the way people say them. */
  function spoken(expr) {
    const v = T().verbs;
    return expr.replace(/[+−×÷()]/g, ch => ' ' + v[{ '+': '+', '−': '-', '×': '*', '÷': '/', '(': '(', ')': ')' }[ch]] + ' ').replace(/\s+/g, ' ').trim();
  }

  /* ---------- keypad ---------- */
  /* The typed sum stays until it is judged or a new hand is dealt, so closing and reopening keeps it (R1.1). */
  function openKeypad() {
    if (!state.hand || state.done) return;
    $('kpMsg').textContent = '';
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
      b.onclick = () => { state.kp.push(i); $('kpMsg').textContent = ''; renderKeypad(); };
      box.appendChild(b);
    });
    $('kpCheck').disabled = state.kp.filter(k => typeof k === 'number').length !== 4;
  }
  document.querySelectorAll('.kp-ops button').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.k;
    if (k === 'back') state.kp.pop();
    else if (k === 'clear') state.kp = [];
    else state.kp.push(k);
    $('kpMsg').textContent = '';
    renderKeypad();
  }));
  /* A typed sum that does not read is not "not heard": say so in the keypad, keep it open and keep the sum (R1.1). */
  $('kpCheck').addEventListener('click', () => {
    const t = kpText();
    if (M.check(t, state.hand.map(c => c.value), settings.mode).status === 'unclear') { $('kpMsg').textContent = T().kpUnclear; return; }
    $('keypad').close();
    state.kp = [];
    judge([t]);
  });

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
    $('resetScore').textContent = T().resetScore(stats.solved);
    $('resetScore').disabled = !stats.solved;
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
    if ($('kpMsg').textContent) $('kpMsg').textContent = T().kpUnclear;
    paint();
    render();
    if (state.hand && $('keypad').open) renderKeypad();
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
    if (changedMode && state.hand) { state.hand = null; state.done = false; state.kp = []; setView({}); render(); }
  });
  $('resetScore').addEventListener('click', () => {
    if (!stats.solved || !confirm(T().resetConfirm(stats.solved))) return;   // R1.6
    stats.solved = 0;
    save('make24.stats', stats);
    render();
  });

  applyLanguage();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  self.Make24App = { judge, state, settings };   // for the browser tests
})();
