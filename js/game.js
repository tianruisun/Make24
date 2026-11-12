/* Make 24 rules, with no page: deck, dealing, solver, and reading a spoken or typed answer.
   Loaded by the page (self.Make24) and by the unit tests in Node (require). All arithmetic is exact (fractions),
   so 8 ÷ (3 − 8 ÷ 3) is exactly 24. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Make24 = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const TARGET = 24;

  /* ---------- exact fractions ---------- */
  const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a || 1; };
  function frac(n, d = 1) {
    if (d === 0) return null;
    if (d < 0) { n = -n; d = -d; }
    const g = gcd(n, d);
    return { n: n / g, d: d / g };
  }
  function apply(op, a, b) {
    if (!a || !b) return null;
    switch (op) {
      case '+': return frac(a.n * b.d + b.n * a.d, a.d * b.d);
      case '-': return frac(a.n * b.d - b.n * a.d, a.d * b.d);
      case '*': return frac(a.n * b.n, a.d * b.d);
      case '/': return b.n === 0 ? null : frac(a.n * b.d, a.d * b.n);
    }
    return null;
  }
  const isTarget = f => !!f && f.d === 1 && f.n === TARGET;
  const fracText = f => !f ? '' : f.d === 1 ? String(f.n) : `${f.n}/${f.d}`;

  /* ---------- cards ---------- */
  const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const SUITS = ['♠', '♥', '♣', '♦'];
  /* The three customs of rule 1: J Q K are 11 12 13, or all count 10, or are taken out. */
  const DECK_MODES = ['13', '10', 'nofaces'];
  function rankValue(rank, mode) {
    const i = RANKS.indexOf(rank);
    if (i < 0) return null;
    if (i >= 10 && mode === '10') return 10;
    if (i >= 10 && mode === 'nofaces') return null;
    return i + 1;
  }
  function makeDeck(mode = '13') {
    const deck = [];
    for (const suit of SUITS) for (const rank of RANKS) {
      const value = rankValue(rank, mode);
      if (value != null) deck.push({ rank, suit, value });
    }
    return deck;
  }

  /* ---------- solver ---------- */
  /* One way to make 24 from the numbers (each used once), as text with brackets, or null. */
  function solve(values, target = TARGET) {
    const items = values.map(v => typeof v === 'object' ? { f: v, s: fracText(v), p: 3 } : { f: frac(v), s: String(v), p: 3 });
    const want = frac(target);
    const OPS = [['+', 1], ['-', 1], ['*', 2], ['/', 2]];
    const wrap = (x, need, right, op) => (x.p < need || (right && x.p === need && (op === '-' || op === '/'))) ? `(${x.s})` : x.s;
    function rec(list) {
      if (list.length === 1) return list[0].f && list[0].f.n === want.n && list[0].f.d === want.d ? list[0].s : null;
      for (let i = 0; i < list.length; i++) for (let j = 0; j < list.length; j++) {
        if (i === j) continue;
        const rest = list.filter((_, k) => k !== i && k !== j);
        for (const [op, p] of OPS) {
          if ((op === '+' || op === '*') && j < i) continue;   // a+b = b+a
          const f = apply(op, list[i].f, list[j].f);
          if (!f) continue;
          const s = `${wrap(list[i], p, false, op)} ${SYMBOL[op]} ${wrap(list[j], p, true, op)}`;
          const r = rec(rest.concat({ f, s, p }));
          if (r) return r;
        }
      }
      return null;
    }
    return rec(items);
  }
  const SYMBOL = { '+': '+', '-': '−', '*': '×', '/': '÷' };

  /* Four cards whose values can make 24. rng() returns [0, 1). Gives up after many tries (never happens with real decks). */
  function deal(mode = '13', rng = Math.random) {
    const deck = makeDeck(mode);
    for (let tries = 0; tries < 1000; tries++) {
      const pool = deck.slice(), hand = [];
      for (let k = 0; k < 4; k++) hand.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
      if (solve(hand.map(c => c.value))) return hand;
    }
    return null;
  }

  /* ---------- reading an answer ---------- */
  const ZH_DIGIT = { '零': 0, '〇': 0, '一': 1, '幺': 1, '二': 2, '两': 2, '俩': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
  const EN_NUM = {
    zero: 0, one: 1, won: 1, two: 2, to: 2, too: 2, three: 3, tree: 3, four: 4, for: 4, fore: 4, five: 5, six: 6, seven: 7,
    eight: 8, ate: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
    seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20
  };
  /* "twenty-four", "twenty four", "thirty six" (R3.1). A unit word that is also "to" / "too" is left out: "twenty to" is
     not a number anyone says in a sum. */
  const EN_TENS = { twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
  const EN_UNIT = { one: 1, won: 1, two: 2, three: 3, tree: 3, four: 4, for: 4, fore: 4, five: 5, six: 6, seven: 7, eight: 8, ate: 8, nine: 9 };
  /* "three quarters" = 3 ÷ 4 (R1.2). */
  const EN_DENOM = { half: 2, halves: 2, third: 3, thirds: 3, quarter: 4, quarters: 4, fourth: 4, fourths: 4, fifth: 5, fifths: 5,
    sixth: 6, sixths: 6, seventh: 7, sevenths: 7, eighth: 8, eighths: 8, ninth: 9, ninths: 9, tenth: 10, tenths: 10 };
  const CARD_WORD = { a: 'A', ace: 'A', j: 'J', jack: 'J', q: 'Q', queen: 'Q', k: 'K', king: 'K', '尖': 'A', '勾': 'J', '圈': 'Q', '老k': 'K' };
  /* Longest phrases first, so "divided by" wins over "by" and "左括号" over "括号". */
  const PHRASES = [
    /* "= 3", "等于三": the result of a step (or the final "= 24"). Kept as a separator so "9 − 6 = 3, 3 × 8 = 24" reads. */
    ['结果是', 'eq'], ['等于', 'eq'], ['得到', 'eq'], ['得', 'eq'], ['equals', 'eq'], ['equal', 'eq'], ['makes', 'eq'],
    ['gives', 'eq'], ["that's", 'eq'], ['is', 'eq'],
    ['multiplied by', '*'], ['divided by', '/'], ['divide by', '/'], ['open bracket', '('], ['open brackets', '('],
    ['open parenthesis', '('], ['open paren', '('], ['left bracket', '('], ['left parenthesis', '('], ['bracket open', '('],
    ['close bracket', ')'], ['close brackets', ')'], ['close parenthesis', ')'], ['close paren', ')'], ['right bracket', ')'],
    ['right parenthesis', ')'], ['bracket close', ')'], ['end bracket', ')'], ['take away', '-'],
    ['左括号', '('], ['前括号', '('], ['开括号', '('], ['括号开始', '('], ['右括号', ')'], ['后括号', ')'], ['反括号', ')'],
    ['括号结束', ')'], ['关括号', ')'], ['分之', 'fracof'], ['乘以', '*'], ['乘上', '*'], ['除以', '/'], ['加上', '+'], ['减去', '-'], ['减掉', '-'],
    ['括号', 'bracket'], ['加', '+'], ['减', '-'], ['乘', '*'], ['除', '/'],
    ['plus', '+'], ['add', '+'], ['minus', '-'], ['subtract', '-'], ['times', '*'], ['multiply', '*'], ['over', '/'],
    ['divide', '/'], ['bracket', 'bracket'], ['brackets', 'bracket'], ['parenthesis', 'bracket'], ['x', '*']
  ];
  const SYMBOLS = { '=': 'eq', '＝': 'eq', '+': '+', '＋': '+', '-': '-', '−': '-', '–': '-', '—': '-', '－': '-', '*': '*', '×': '*', 'x': '*', '✕': '*', '·': '*',
    '/': '/', '÷': '/', '／': '/', '(': '(', ')': ')', '（': '(', '）': ')', '[': '(', ']': ')', '【': '(', '】': ')', '{': '(', '}': ')' };
  /* Sound-alikes the recogniser writes for the words of a sum (成 for 乘, 酒 for 九). Tried as a second reading of what
     was heard, never instead of it, so a real word is still read the way it was heard. */
  const ZH_ALIKE = [
    [/[成城程称承呈]/g, '乘'], [/[出处储厨]/g, '除'], [/[家佳夹嘉]/g, '加'], [/[剪简检见件]/g, '减'],
    [/[扩阔刮过]号/g, '括号'], [/乘[已乙]/g, '乘以'], [/除[已乙]/g, '除以'], [/等[鱼余]/g, '等于'],
    [/[酒久]/g, '九'], [/[吧爸拔]/g, '八'], [/[溜]/g, '六'], [/[期器]/g, '七'], [/[山]/g, '三'], [/[儿尔]/g, '二'],
    [/[武舞午]/g, '五'], [/[死似]/g, '四'], [/[依衣医]/g, '一']
  ];
  function soundAlike(text) {
    let s = String(text || '');
    for (const [re, w] of ZH_ALIKE) s = s.replace(re, w);
    return s;
  }

  /* Chinese numeral at s[i]: 1-99 ("十三", "二十", "三"). Returns [value, length] or null. */
  function zhNumber(s, i) {
    const a = ZH_DIGIT[s[i]], ten = s[i] === '十';
    if (a == null && !ten) return null;
    if (ten) { const b = ZH_DIGIT[s[i + 1]]; return b ? [10 + b, 2] : [10, 1]; }
    if (s[i + 1] === '十') { const b = ZH_DIGIT[s[i + 2]]; return b ? [a * 10 + b, 3] : [a * 10, 2]; }
    return [a, 1];
  }

  /* Text → tokens: {t:'num', v, card?}, {t:'op', v:'+-*\/'}, {t:'(' | ')', auto?}. Unknown words (fillers such as 嗯, "um",
     "and") are skipped: a filler must not turn a right answer into "not heard". Brackets the app adds around a spoken
     fraction carry auto: true, so they do not count as brackets the player said. */
  function tokenize(text, mode = '13') {
    /* Punctuation becomes a mark (\u0001) that reads as nothing, but that "twenty, three" does not join across (R4.1). */
    let s = String(text || '').toLowerCase().replace(/[，,。.、？?！!；;：:]/g, ' \u0001 ');
    const raw = [];
    for (let i = 0; i < s.length;) {
      const ch = s[i];
      if (/\s/.test(ch)) { i++; continue; }
      const d = /^\d+/.exec(s.slice(i));
      if (d) { raw.push({ t: 'num', v: +d[0] }); i += d[0].length; continue; }
      const p = PHRASES.find(([w]) => s.startsWith(w, i) && wordEdge(s, i, w));
      if (p) {
        if (p[1] === 'bracket' || p[1] === 'fracof' || p[1] === 'eq') raw.push({ t: p[1] });
        else if (p[1] === '(' || p[1] === ')') raw.push({ t: p[1] });
        else raw.push({ t: 'op', v: p[1] });
        i += p[0].length; continue;
      }
      if (SYMBOLS[ch] && !(ch === 'x' && !wordEdge(s, i, 'x'))) {
        const v = SYMBOLS[ch];
        raw.push(v === '(' || v === ')' || v === 'eq' ? { t: v } : { t: 'op', v }); i++; continue;
      }
      const zh = zhNumber(s, i);
      if (zh) { raw.push({ t: 'num', v: zh[0] }); i += zh[1]; continue; }
      const w = /^[a-z']+/.exec(s.slice(i));
      const cardKey = w ? w[0] : (s.startsWith('老k', i) ? '老k' : CARD_WORD[ch] ? ch : null);
      if (cardKey && CARD_WORD[cardKey]) {
        const rank = CARD_WORD[cardKey];
        raw.push({ t: 'num', v: rankValue(rank, mode === 'nofaces' ? '13' : mode), card: rank });
        i += cardKey.length; continue;
      }
      if (w && EN_TENS[w[0]] != null) {
        const u = /^[ \t-]*([a-z]+)/.exec(s.slice(i + w[0].length));
        if (u && EN_UNIT[u[1]] != null) {
          /* joined: the two words, so a step can also read them as a result and the start of the next step (R4.1) */
          raw.push({ t: 'num', v: EN_TENS[w[0]] + EN_UNIT[u[1]], joined: [EN_TENS[w[0]], EN_UNIT[u[1]]] });
          i += w[0].length + u[0].length; continue;
        }
        raw.push({ t: 'num', v: EN_TENS[w[0]] }); i += w[0].length; continue;
      }
      if (w && EN_NUM[w[0]] != null) { raw.push({ t: 'num', v: EN_NUM[w[0]] }); i += w[0].length; continue; }
      if (w && EN_DENOM[w[0]] != null) { raw.push({ t: 'denom', v: EN_DENOM[w[0]] }); i += w[0].length; continue; }
      i += w ? w[0].length : 1;
    }
    /* Fractions: "四分之三" (4 分之 3) and "three quarters" (3, quarters) both become (3 ÷ 4). A 分之 or "quarters"
       with no number on the side it needs is dropped, so the answer then has the wrong numbers and says so. */
    const fr = [];
    for (let k = 0; k < raw.length; k++) {
      const tk = raw[k], prev = fr[fr.length - 1], next = raw[k + 1];
      if (tk.t === 'fracof') {
        if (prev && prev.t === 'num' && next && next.t === 'num') {
          fr.pop();
          fr.push({ t: '(', auto: true }, next, { t: 'op', v: '/' }, prev, { t: ')', auto: true });
          k++;
        }
        continue;
      }
      if (tk.t === 'denom') {
        if (prev && prev.t === 'num') { fr.pop(); fr.push({ t: '(', auto: true }, prev, { t: 'op', v: '/' }, { t: 'num', v: tk.v }, { t: ')', auto: true }); }
        continue;
      }
      fr.push(tk);
    }
    /* A plain "括号" / "bracket" opens before a number or "(", and closes after a number or ")". */
    const tokens = [];
    for (let k = 0; k < fr.length; k++) {
      const tk = fr[k];
      if (tk.t !== 'bracket') { tokens.push(tk); continue; }
      const prev = tokens[tokens.length - 1];
      tokens.push({ t: prev && (prev.t === 'num' || prev.t === ')') ? ')' : '(' });
    }
    return { tokens };
  }
  /* A Latin word must stand alone ("x" in "six" is not times); Chinese and symbols always do. */
  function wordEdge(s, i, w) {
    if (!/^[a-z]/.test(w)) return true;
    const before = s[i - 1], after = s[i + w.length];
    return !(before && /[a-z]/.test(before)) && !(after && /[a-z]/.test(after));
  }

  /* Tokens → expression tree with the usual order (× ÷ before + −). Returns a node or null if it does not read. */
  function parse(tokens) {
    let i = 0;
    const peek = () => tokens[i];
    function primary() {
      const tk = peek();
      if (!tk) return null;
      if (tk.t === 'num') { i++; return tk.f ? { num: tk.v, f: tk.f, parts: tk.parts } : { num: tk.v }; }
      if (tk.t === '(') {
        i++;
        const e = sum();
        if (!e) return null;
        if (peek() && peek().t === ')') i++;   // a missing last ")" is forgiven: speech often drops it
        return e;
      }
      return null;
    }
    function product() {
      let left = primary();
      while (left && peek() && peek().t === 'op' && (peek().v === '*' || peek().v === '/')) {
        const op = tokens[i++].v, right = primary();
        if (!right) return null;
        left = { op, a: left, b: right };
      }
      return left;
    }
    function sum() {
      let left = product();
      while (left && peek() && peek().t === 'op' && (peek().v === '+' || peek().v === '-')) {
        const op = tokens[i++].v, right = product();
        if (!right) return null;
        left = { op, a: left, b: right };
      }
      return left;
    }
    const tree = sum();
    return tree && i === tokens.length ? tree : null;
  }
  function evaluate(node) {
    if (!node) return null;
    if ('num' in node) return node.f || frac(node.num);
    return apply(node.op, evaluate(node.a), evaluate(node.b));
  }
  const PREC = { '+': 1, '-': 1, '*': 2, '/': 2 };
  function show(node, parentPrec = 0, right = false, parentOp = '') {
    if ('num' in node) return node.parts ? `(${node.parts[0]} ÷ ${node.parts[1]})` : node.f ? fracText(node.f).replace('/', ' ÷ ') : String(node.num);
    const p = PREC[node.op];
    const s = `${show(node.a, p, false, node.op)} ${SYMBOL[node.op]} ${show(node.b, p, true, node.op)}`;
    const need = p < parentPrec || (right && p === parentPrec && (parentOp === '-' || parentOp === '/'));
    return need ? `(${s})` : s;
  }
  const numbersOf = node => 'num' in node ? [node.num] : numbersOf(node.a).concat(numbersOf(node.b));

  /* Every way to put brackets into "n op n op n op n", keeping the spoken order. */
  function bracketings(nums, ops) {
    if (nums.length === 1) return [{ num: nums[0] }];
    const out = [];
    for (let k = 0; k < ops.length; k++) {
      for (const a of bracketings(nums.slice(0, k + 1), ops.slice(0, k)))
        for (const b of bracketings(nums.slice(k + 1), ops.slice(k + 1))) out.push({ op: ops[k], a, b });
    }
    return out;
  }

  const sameNumbers = (a, b) => a.length === b.length && a.slice().sort((x, y) => x - y).join() === b.slice().sort((x, y) => x - y).join();

  /* Judges one answer for these card values.
     status: 'correct' | 'wrong' (reads, uses the cards, not 24) | 'cards' (wrong numbers) | 'unclear' (does not read).
     expr: the answer as the app understood it, with brackets; value: what it comes to. */
  function check(text, values, mode = '13') {
    const steps = splitSteps(tokenize(text, mode).tokens);
    if (steps.length >= 2) return checkSteps(steps, values, String(text || ''));
    const r = checkOne(steps[0].tokens, values, text);
    if (r.status !== 'cards') return r;
    /* Only part of the cards ("九减六", "9减6等于3"): judged as a first step, so the app can say it is not finished and
       what is left, or that the claimed result is wrong (R3.2, R3.3). A sum with a number that is no card stays 'cards'. */
    const st = checkSteps(steps, values, String(text || ''));
    if (steps[0].claim && (st.open || st.claimed != null)) return st;
    /* No claim: still "use the four cards", but marked partial so the page keeps listening and can go on from it. */
    if (st.open) { r.partial = true; r.left = st.left; r.canFinish = st.canFinish; }
    return r;
  }
  function checkOne(tokens, values, text) {
    const nums = tokens.filter(t => t.t === 'num').map(t => t.v);
    if (!nums.length) return { status: 'unclear', heard: String(text || '') };
    const flat = tokens.filter(t => t.t === 'num' || t.t === 'op');
    let hasBrackets = tokens.some(t => (t.t === '(' || t.t === ')') && !t.auto);
    let tree = parse(tokens);
    if (!tree && hasBrackets) { tree = parse(flat); hasBrackets = false; }   // brackets that do not pair up are ignored
    if (!tree) return { status: 'unclear', heard: String(text || ''), numbers: nums };
    const used = numbersOf(tree);
    if (!sameNumbers(used, values)) return { status: 'cards', heard: String(text || ''), numbers: used, expr: show(tree) };
    let value = evaluate(tree);
    if (isTarget(value)) return { status: 'correct', expr: show(tree), value: fracText(value) };
    if (!hasBrackets) {
      /* No brackets spoken: the player may have meant them. Accept if some bracketing of the same order makes 24. */
      const ns = flat.filter(t => t.t === 'num').map(t => t.v), os = flat.filter(t => t.t === 'op').map(t => t.v);
      const hit = bracketings(ns, os).find(b => isTarget(evaluate(b)));
      if (hit) return { status: 'correct', expr: show(hit), value: '24', bracketsAdded: true };
    }
    return { status: 'wrong', expr: show(tree), value: value ? fracText(value) : null };
  }

  /* ---------- an answer in steps: "9 − 6 = 3, 3 × 8 = 24" ----------
     The tokens are cut at each "=" (等于, equals...). The number right after an "=" is the result the player claims for
     the step before it; the rest starts the next step. A step that starts with an operator ("等于三，乘以八") goes on from
     the last result. Returns [{tokens, claim: [tokens] | null}]: one entry means a plain answer, read as before. */
  function splitSteps(tokens) {
    const segs = [[]];
    for (const tk of tokens) tk.t === 'eq' ? segs.push([]) : segs[segs.length - 1].push(tk);
    const hasNum = seg => seg.some(t => t.t === 'num');
    const hasOp = seg => seg.some(t => t.t === 'op');
    const steps = [];
    let pending = segs[0];
    for (let k = 1; k < segs.length; k++) {
      const seg = segs[k];
      if (!hasNum(pending)) { pending = seg; continue; }        // "答案是 ...", "the answer is ..."
      let claim = null, rest = seg;
      if (seg[0] && seg[0].t === '(' && seg[0].auto) {          // a spoken fraction: "等于四分之一"
        const j = seg.findIndex(t => t.t === ')' && t.auto);
        if (j > 0) { claim = seg.slice(0, j + 1); rest = seg.slice(j + 1); }
      } else if (seg[0] && seg[0].t === 'num') { claim = [seg[0]]; rest = seg.slice(1); }
      steps.push({ tokens: pending, claim });
      pending = rest[0] && rest[0].t === 'op' ? [{ t: 'num', v: null, prev: true }].concat(rest) : rest;
    }
    /* What is left after the last "=" counts only if it is a sum of its own; a repeated "二十四" is not. */
    if (!steps.length || (hasNum(pending) && hasOp(pending))) steps.push({ tokens: pending, claim: null });
    return steps;
  }
  const same = (a, b) => !!a && !!b && a.n === b.n && a.d === b.d;
  /* A spoken fraction (auto brackets) becomes one number, so it can stand for an earlier result as well as two cards. */
  function joinFractions(tokens) {
    const out = [];
    for (let k = 0; k < tokens.length; k++) {
      const [a, b, c, d, e] = tokens.slice(k, k + 5);
      if (a.t === '(' && a.auto && b && b.t === 'num' && c && c.t === 'op' && d && d.t === 'num' && e && e.t === ')' && e.auto) {
        out.push({ t: 'num', v: b.v / d.v, f: frac(b.v, d.v), parts: [b.v, d.v] });
        k += 4;
      } else out.push(a);
    }
    return out;
  }
  const leaves = node => 'num' in node ? [node] : leaves(node.a).concat(leaves(node.b));
  /* bracketings() for leaf nodes (numbers that may be fractions or earlier results). */
  function bracketingsOf(nodes, ops) {
    if (nodes.length === 1) return [nodes[0]];
    const out = [];
    for (let k = 0; k < ops.length; k++)
      for (const a of bracketingsOf(nodes.slice(0, k + 1), ops.slice(0, k)))
        for (const b of bracketingsOf(nodes.slice(k + 1), ops.slice(k + 1))) out.push({ op: ops[k], a, b });
    return out;
  }
  function checkSteps(steps, values, heard) {
    const original = steps;
    steps = steps.map(x => ({ tokens: x.tokens, claim: x.claim }));
    const pool = values.map(v => frac(v));
    const done = [];
    const take = f => { const k = pool.findIndex(p => same(p, f)); if (k < 0) return false; pool.splice(k, 1); return true; };
    const shown = () => done.join('; ');
    let prev = null;
    for (let s = 0; s < steps.length; s++) {
      const st = steps[s];
      const tokens = joinFractions(st.tokens.map(t => t.prev ? Object.assign({}, t, { v: prev && prev.n / prev.d, f: prev }) : t));
      if (tokens.some(t => t.prev && !t.f)) return { status: 'unclear', heard };
      const flat = tokens.filter(t => t.t === 'num' || t.t === 'op');
      let tree = parse(tokens), said = tokens.some(t => (t.t === '(' || t.t === ')') && !t.auto);
      if (!tree && said) { tree = parse(flat); said = false; }  // brackets that do not pair up are ignored
      if (!tree || 'num' in tree) return { status: 'unclear', heard };
      let claim = st.claim ? evaluate(parse(joinFractions(st.claim))) : null;
      let value = evaluate(tree);
      /* "等于三，三乘以八" can come back as "= 33 × 8": a claim that starts with the step's result, right before an
         operator, may be that result with the next number run on. That reading is taken only if it makes the answer right, or
         right so far (not finished yet); otherwise the claim stays as said and is reported (R3.6). */
      if (claim && value && claim.d === 1 && value.d === 1 && value.n > 0 && !same(claim, value) && st.claim.length === 1 &&
          steps[s + 1] && steps[s + 1].tokens[0] && steps[s + 1].tokens[0].prev && String(claim.n).startsWith(String(value.n))) {
        const alt = original.map(x => ({ tokens: x.tokens, claim: x.claim }));
        alt[s] = { tokens: st.tokens, claim: [{ t: 'num', v: value.n }] };
        alt[s + 1] = { tokens: [{ t: 'num', v: +String(claim.n).slice(String(value.n).length) }].concat(steps[s + 1].tokens.slice(1)), claim: steps[s + 1].claim };
        const r = checkSteps(alt, values, heard);
        if (r.status === 'correct' || r.open) return r;   // right, or right so far (the heard line shows the reading)
      }
      /* "is twenty three plus one is four" with no comma: "twenty three" may be the claim 20 and a next step starting with
         3. Taken only if it makes the answer right, or right so far (R4.1, like the split above). */
      if (claim && value && !same(claim, value) && st.claim.length === 1 && st.claim[0].joined && steps[s + 1]) {
        const [tens, unit] = st.claim[0].joined;
        const alt = original.map(x => ({ tokens: x.tokens, claim: x.claim }));
        alt[s] = { tokens: st.tokens, claim: [{ t: 'num', v: tens }] };
        alt[s + 1] = { tokens: [{ t: 'num', v: unit }].concat(steps[s + 1].tokens.filter((t, i) => !(i === 0 && t.prev))), claim: steps[s + 1].claim };
        const r = checkSteps(alt, values, heard);
        if (r.status === 'correct' || r.open) return r;
      }
      if (claim && !same(claim, value) && !said) {
        /* No brackets spoken in this step: accept a bracketing of the same order that gives the claimed result. */
        const nodes = flat.filter(t => t.t === 'num').map(t => t.f ? { num: t.v, f: t.f, parts: t.parts } : { num: t.v });
        const hit = bracketingsOf(nodes, flat.filter(t => t.t === 'op').map(t => t.v)).find(b => same(evaluate(b), claim));
        if (hit) { tree = hit; value = claim; }
      }
      for (const leaf of leaves(tree)) {
        if (leaf.f && take(leaf.f)) continue;                   // an earlier result, or a fraction kept as one number
        if (leaf.parts ? take(frac(leaf.parts[0])) && take(frac(leaf.parts[1])) : !leaf.f && take(frac(leaf.num))) continue;
        done.push(show(tree));
        return { status: 'cards', heard, expr: shown(), steps: true };
      }
      if (!value || (claim && !same(claim, value))) {
        done.push(show(tree));
        return { status: 'wrong', heard, expr: shown(), value: value ? fracText(value) : null, claimed: claim ? fracText(claim) : null, steps: true };
      }
      done.push(show(tree) + ' = ' + fracText(value));
      pool.push(value);
      prev = value;
    }
    /* Every step was right but more than one number is left: not finished yet. left: what is still on the table (cards not
       used and results not used again), so the player can be told (R3.3). */
    if (pool.length > 1) return { status: 'cards', heard, expr: shown(), steps: true, open: true, left: pool.map(fracText), canFinish: !!solve(pool) };
    if (isTarget(pool[0])) return { status: 'correct', heard, expr: shown(), value: '24', steps: true };
    return { status: 'wrong', heard, expr: shown(), value: fracText(pool[0]), steps: true };
  }

  /* The best verdict over the recogniser's alternatives: correct beats wrong beats cards beats unclear. */
  function checkAny(texts, values, mode = '13') {
    const rank = { correct: 0, wrong: 1, cards: 2, unclear: 3 };
    let best = null;
    /* Each text as heard, then (Chinese) the same text with sound-alikes read as the words of a sum. */
    const tries = texts.map(t => [t, t]).concat(texts.map(t => [soundAlike(t), t]).filter(([a, b]) => a !== String(b || '')));
    for (const [t, orig] of tries) {
      const r = check(t, values, mode);
      r.heard = String(orig || '');
      if (!best || rank[r.status] < rank[best.status]) best = r;
      if (r.status === 'correct') break;
    }
    return best || { status: 'unclear', heard: '' };
  }

  return { TARGET, RANKS, SUITS, DECK_MODES, frac, apply, fracText, rankValue, makeDeck, solve, deal,
    tokenize, parse, evaluate, show, bracketings, check, checkAny, splitSteps, soundAlike };
});
