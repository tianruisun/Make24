/* Run with: node tests/run.js  (unit tests of the app's plain logic, no browser) */
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; } catch (e) { fail++; console.log('FAIL', name, '-', e.message); } }

/* ---------- version.js ---------- */
const box = {};
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'version.js'), 'utf8'), { self: box });
t('version is X.Y.Z', () => assert.match(box.APP_VERSION, /^\d+\.\d+\.\d+$/));
t('Production host listed', () => assert.ok(box.PRODUCTION_HOSTS.includes('tianrui-make24.pages.dev')));
t('sw.js caches every file the page loads', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const used = [...html.matchAll(/(?:src|href)="([^"#:]+)"/g)].map(m => m[1]).filter(f => !f.endsWith('sw.js'));
  for (const f of used) {
    assert.ok(fs.existsSync(path.join(ROOT, f)), `${f} is missing`);
    assert.ok(sw.includes(`'./${f}'`), `${f} is not in sw.js`);
  }
});

/* ---------- game rules (js/game.js) ---------- */
const G = require(path.join(ROOT, 'js', 'game.js'));
const F = (n, d) => G.frac(n, d);

t('fractions reduce: 6/8 = 3/4', () => assert.deepStrictEqual(F(6, 8), { n: 3, d: 4 }));
t('fractions: negative sign moves to the top', () => assert.deepStrictEqual(F(3, -6), { n: -1, d: 2 }));
t('8 ÷ (3 − 8 ÷ 3) is exactly 24', () => {
  const v = G.apply('/', F(8), G.apply('-', F(3), G.apply('/', F(8), F(3))));
  assert.deepStrictEqual(v, { n: 24, d: 1 });
});
t('dividing by zero gives no value', () => assert.strictEqual(G.apply('/', F(3), G.apply('-', F(2), F(2))), null));

t('deck J Q K = 11 12 13: 52 cards, values 1-13, 4 of each', () => {
  const d = G.makeDeck('13');
  assert.strictEqual(d.length, 52);
  for (let v = 1; v <= 13; v++) assert.strictEqual(d.filter(c => c.value === v).length, 4, String(v));
});
t('deck J Q K = 10: 52 cards, sixteen 10s', () => {
  const d = G.makeDeck('10');
  assert.strictEqual(d.length, 52);
  assert.strictEqual(d.filter(c => c.value === 10).length, 16);
  assert.ok(d.every(c => c.value <= 10));
});
t('deck without J Q K: 40 cards, A-10', () => {
  const d = G.makeDeck('nofaces');
  assert.strictEqual(d.length, 40);
  assert.ok(d.every(c => !['J', 'Q', 'K'].includes(c.rank)));
});
t('A is 1 in every deck', () => { for (const m of G.DECK_MODES) assert.strictEqual(G.rankValue('A', m), 1); });
t('every card in a deck is different', () => { const d = G.makeDeck('13'); assert.strictEqual(new Set(d.map(c => c.rank + c.suit)).size, 52); });

/* Known hard hands and known impossible ones. */
const solvable = [[8, 3, 8, 3], [5, 5, 5, 1], [3, 3, 7, 7], [1, 5, 5, 5], [4, 4, 10, 10], [1, 3, 4, 6], [6, 6, 6, 6], [13, 11, 1, 1], [1, 1, 1, 8], [12, 12, 12, 12]];
const impossible = [[1, 1, 1, 1], [1, 1, 1, 2], [13, 13, 13, 13], [1, 1, 5, 9], [7, 7, 7, 7]];
for (const h of solvable) t(`solver finds 24 for ${h}`, () => {
  const s = G.solve(h);
  assert.ok(s, 'no answer');
  const r = G.check(s, h);
  assert.strictEqual(r.status, 'correct', `${s} → ${JSON.stringify(r)}`);
});
for (const h of impossible) t(`solver says no answer for ${h}`, () => assert.strictEqual(G.solve(h), null));
t('solver: 1362 of the 1820 hands from 1-13 can make 24 (the known count), and each answer it writes checks as correct', () => {
  let n = 0, all = 0;
  for (let a = 1; a <= 13; a++) for (let b = a; b <= 13; b++) for (let c = b; c <= 13; c++) for (let d = c; d <= 13; d++) {
    all++;
    const s = G.solve([a, b, c, d]);
    if (s) { n++; if (G.check(s, [a, b, c, d]).status !== 'correct') throw new Error(`${s} for ${[a, b, c, d]} does not check`); }
  }
  assert.strictEqual(all, 1820);
  assert.strictEqual(n, 1362);
});

let seed = 1;
const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
for (const m of G.DECK_MODES) t(`deal (${m}): 300 hands, 4 different cards, each can make 24`, () => {
  const deck = G.makeDeck(m).map(c => c.rank + c.suit);
  for (let i = 0; i < 300; i++) {
    const h = G.deal(m, rng);
    assert.strictEqual(h.length, 4);
    assert.strictEqual(new Set(h.map(c => c.rank + c.suit)).size, 4);
    assert.ok(h.every(c => deck.includes(c.rank + c.suit)));
    assert.ok(G.solve(h.map(c => c.value)), JSON.stringify(h));
  }
});

/* ---------- reading answers: [what was heard, card values, expected status, expected expression] ---------- */
const H = [8, 3, 8, 3];
const answers = [
  // symbols, as recognisers often write them
  ['8÷(3-8÷3)', H, 'correct', '8 ÷ (3 − 8 ÷ 3)'],
  ['8/(3-8/3)', H, 'correct', '8 ÷ (3 − 8 ÷ 3)'],
  ['8 ÷ （3 − 8 ÷ 3）', H, 'correct', '8 ÷ (3 − 8 ÷ 3)'],
  ['8÷(3-8÷3)=24', H, 'correct', '8 ÷ (3 − 8 ÷ 3)'],
  // Chinese words
  ['八除以括号三减八除以三括号', H, 'correct', '8 ÷ (3 − 8 ÷ 3)'],
  ['八除以左括号三减去八除以三右括号', H, 'correct', '8 ÷ (3 − 8 ÷ 3)'],
  ['八除以括号三减八除以三', H, 'correct', '8 ÷ (3 − 8 ÷ 3)'],                 // last ")" not said
  ['八除以三减八除以三', H, 'correct', '8 ÷ (3 − 8 ÷ 3)'],                     // no brackets: the order allows them
  ['八除以括号三减八除以三括号等于二十四', H, 'correct', '8 ÷ (3 − 8 ÷ 3)'],
  ['八加三加八加三', H, 'wrong', '8 + 3 + 8 + 3'],
  ['八乘三', H, 'cards', '8 × 3'],
  ['十三加十一加一减一', [13, 11, 1, 1], 'correct', '13 + 11 + 1 − 1'],
  ['十二乘两除以一乘一', [12, 2, 1, 1], 'correct', '12 × 2 ÷ 1 × 1'],
  ['K加J加A减A', [13, 11, 1, 1], 'correct', '13 + 11 + 1 − 1'],
  ['老K加勾加尖减尖', [13, 11, 1, 1], 'correct', '13 + 11 + 1 − 1'],
  ['括号一加二加三括号乘四', [1, 2, 3, 4], 'correct', '(1 + 2 + 3) × 4'],
  ['一加二加三乘四', [1, 2, 3, 4], 'correct', '(1 + 2 + 3) × 4'],
  ['六乘四，加一减一。', [6, 4, 1, 1], 'correct', '6 × 4 + 1 − 1'],
  // English words
  ['eight divided by open bracket three minus eight divided by three close bracket', H, 'correct', '8 ÷ (3 − 8 ÷ 3)'],
  ['eight over bracket three minus eight over three bracket', H, 'correct', '8 ÷ (3 − 8 ÷ 3)'],
  ['five times open paren five minus one over five', [5, 5, 1, 5], 'correct', '5 × (5 − 1 ÷ 5)'],
  ['5 times 5 minus 1 divided by 5', [5, 5, 1, 5], 'correct', '5 × (5 − 1 ÷ 5)'],
  ['open parenthesis 1 plus 2 plus 3 close parenthesis times 4', [1, 2, 3, 4], 'correct', '(1 + 2 + 3) × 4'],
  ['six times four plus ace minus one', [6, 4, 1, 1], 'correct', '6 × 4 + 1 − 1'],
  ['king plus jack plus 1 minus 1', [13, 11, 1, 1], 'correct', '13 + 11 + 1 − 1'],
  ['6 x 4 x 1 x 1 equals 24', [6, 4, 1, 1], 'correct', '6 × 4 × 1 × 1'],
  ['6 x 4 x 1 x 1 is 24', [6, 4, 1, 1], 'correct', '6 × 4 × 1 × 1'],
  ['six times for times one times one', [6, 4, 1, 1], 'correct', '6 × 4 × 1 × 1'],   // "four" heard as "for"
  ['ate times three times one times one', [8, 3, 1, 1], 'correct', '8 × 3 × 1 × 1'], // "eight" heard as "ate"
  ['6 multiplied by 4 multiplied by 1 multiplied by 1', [6, 4, 1, 1], 'correct', '6 × 4 × 1 × 1'],
  ['6 * 4 + 1 - 1', [6, 4, 1, 1], 'correct', '6 × 4 + 1 − 1'],
  ['1 + 2 + 3 + 4', [1, 2, 3, 4], 'wrong', '1 + 2 + 3 + 4'],
  // wrong cards, things that do not read
  ['6 x 4', [6, 4, 1, 1], 'cards', '6 × 4'],
  ['6 x 4 x 1 x 2', [6, 4, 1, 1], 'cards', '6 × 4 × 1 × 2'],
  ['6 x 4 x 1 x 1 x 1', [6, 4, 1, 1], 'cards', '6 × 4 × 1 × 1 × 1'],
  // fractions said the usual way (R1.2): 四分之三 and "three quarters" are 3 ÷ 4
  ['六除以括号一减四分之三括号', [6, 1, 3, 4], 'correct', '6 ÷ (1 − 3 ÷ 4)'],
  ['6除以括号1减四分之三括号', [6, 1, 3, 4], 'correct', '6 ÷ (1 − 3 ÷ 4)'],
  ['六除以括号一减四分之三', [6, 1, 3, 4], 'correct', '6 ÷ (1 − 3 ÷ 4)'],
  ['六除以一减四分之三', [6, 1, 3, 4], 'correct', '6 ÷ (1 − 3 ÷ 4)'],
  ['八除以括号三减三分之八括号', H, 'correct', '8 ÷ (3 − 8 ÷ 3)'],
  ['八除以三减三分之八', H, 'correct', '8 ÷ (3 − 8 ÷ 3)'],
  ['six divided by open bracket one minus three quarters close bracket', [6, 1, 3, 4], 'correct', '6 ÷ (1 − 3 ÷ 4)'],
  ['six divided by one minus three quarters', [6, 1, 3, 4], 'correct', '6 ÷ (1 − 3 ÷ 4)'],
  ['five times five minus one fifth', [5, 5, 1, 5], 'correct', '5 × (5 − 1 ÷ 5)'],
  ['5 times open bracket 5 minus a fifth close bracket', [5, 5, 1, 5], 'correct', '5 × (5 − 1 ÷ 5)'],
  ['八除以四分之三', [8, 3, 4, 1], 'cards', '8 ÷ (3 ÷ 4)'],               // the fraction stays one group: 8 ÷ (3 ÷ 4)
  ['三分之八加三分之八', H, 'wrong', '8 ÷ 3 + 8 ÷ 3'],
  ['分之三', [1, 2, 3, 4], 'cards', '3'],                               // 分之 with nothing before it is dropped
  // filler words are ignored, not "not heard"
  ['嗯，八除以括号三减八除以三括号', H, 'correct', '8 ÷ (3 − 8 ÷ 3)'],
  ['um so six times four and then plus one minus one', [6, 4, 1, 1], 'correct', '6 × 4 + 1 − 1'],
  ['1 2 3 4', [1, 2, 3, 4], 'unclear'],
  ['hello there', [1, 2, 3, 4], 'unclear'],
  ['', [1, 2, 3, 4], 'unclear'],
  ['1 + + 2 3 4', [1, 2, 3, 4], 'unclear']
];
for (const [heard, vals, status, expr] of answers) t(`"${heard}" with ${vals} → ${status}`, () => {
  const r = G.check(heard, vals);
  assert.strictEqual(r.status, status, JSON.stringify(r));
  if (expr) assert.strictEqual(r.expr, expr);
});
t('wrong answer reports what it makes (8+3+8+3 = 22)', () => assert.strictEqual(G.check('8+3+8+3', H).value, '22'));
t('wrong answer with a fraction reports it (8 ÷ 3 + 8 − 3 = 23/3)', () => assert.strictEqual(G.check('8 ÷ 3 + 8 - 3', H).value, '23/3'));
t('an answer that divides by zero is wrong, with no value', () => {
  const r = G.check('8 ÷ (3 − 3) + 8', [8, 3, 3, 8]);
  assert.deepStrictEqual([r.status, r.value], ['wrong', null]);
});
t('brackets added are flagged', () => {
  assert.strictEqual(G.check('八除以三减八除以三', H).bracketsAdded, true);
  assert.strictEqual(G.check('8÷(3-8÷3)', H).bracketsAdded, undefined);
});
t('spoken brackets are taken as said, not re-bracketed (8 ÷ 3 − (8 ÷ 3) is wrong)', () => {
  assert.strictEqual(G.check('8 ÷ 3 − (8 ÷ 3)', H).status, 'wrong');
});
t('"six" is 6, not "s" + "i" + times', () => assert.deepStrictEqual(G.tokenize('six').tokens, [{ t: 'num', v: 6 }]));
t('"x" between numbers is times', () => assert.deepStrictEqual(G.tokenize('8x3').tokens.map(t => t.v), [8, '*', 3]));
t('"parenthesis" does not count as "is" (= the result)', () => assert.strictEqual(G.tokenize('open parenthesis 1').tokens.length, 2));
t('Chinese numbers 1-20', () => {
  const zh = '一 二 三 四 五 六 七 八 九 十 十一 十二 十三 十四 十五 十六 十七 十八 十九 二十'.split(' ');
  zh.forEach((w, i) => assert.deepStrictEqual(G.tokenize(w).tokens, [{ t: 'num', v: i + 1 }], w));
});
t('J Q K by name follow the deck setting', () => {
  assert.deepStrictEqual(G.tokenize('J Q K', '13').tokens.map(t => t.v), [11, 12, 13]);
  assert.deepStrictEqual(G.tokenize('jack queen king', '10').tokens.map(t => t.v), [10, 10, 10]);
});
t('checkAny: a correct alternative wins over a wrong first one', () => {
  const r = G.checkAny(['8 + 3 + 8 + 3', '8 ÷ (3 − 8 ÷ 3)'], H);
  assert.deepStrictEqual([r.status, r.heard], ['correct', '8 ÷ (3 − 8 ÷ 3)']);
});
t('checkAny: with no correct one, a wrong sum beats unreadable text', () => {
  assert.strictEqual(G.checkAny(['blah', '8 + 3 + 8 + 3'], H).status, 'wrong');
});
t('checkAny of nothing is unclear', () => assert.strictEqual(G.checkAny([], H).status, 'unclear'));
t('a fraction\'s own brackets do not count as said: 六除以一减四分之三 is flagged bracketsAdded', () => {
  assert.strictEqual(G.check('六除以一减四分之三', [6, 1, 3, 4]).bracketsAdded, true);
  assert.strictEqual(G.check('六除以括号一减四分之三括号', [6, 1, 3, 4]).bracketsAdded, undefined);
});
t('"three quarters" reads as ( 3 ÷ 4 )', () => assert.deepStrictEqual(G.tokenize('three quarters').tokens.map(t => t.v || t.t), ['(', 3, '/', 4, ')']));

/* ---------- R3: answers in steps, sound-alikes (Terry, 2026-11-13) ---------- */
const S4 = [9, 6, 8, 1];
const stepCase = (text, status, expr, values = S4) => t(`steps: ${text} → ${status}`, () => {
  const r = G.checkAny([text], values);
  assert.strictEqual(r.status, status, JSON.stringify(r));
  if (expr) assert.strictEqual(r.expr, expr);
});
stepCase('9减6等于3，3乘以8等于24，24乘以1等于24', 'correct', '9 − 6 = 3; 3 × 8 = 24; 24 × 1 = 24');
stepCase('九减六等于三，三乘以八等于二十四，再乘以一等于二十四', 'correct', '9 − 6 = 3; 3 × 8 = 24; 24 × 1 = 24');
stepCase('9-6=3 3×8=24 24×1=24', 'correct');
stepCase('9 minus 6 equals 3, 3 times 8 equals 24, 24 times 1 is 24', 'correct');
stepCase('9减6等于3，乘以8等于24，乘1等于24', 'correct', '9 − 6 = 3; 3 × 8 = 24; 24 × 1 = 24');   // goes on from the last result
stepCase('8乘以1等于8，9减6等于3，3乘8等于24', 'correct', '8 × 1 = 8; 9 − 6 = 3; 3 × 8 = 24');     // any order
stepCase('9减6等于33×8等于24 24×1等于24', 'correct', '9 − 6 = 3; 3 × 8 = 24; 24 × 1 = 24');       // "3" and "3 × 8" run together
stepCase('3除以4等于4分之3，1减4分之3等于4分之1，6除以4分之1等于24', 'correct', null, [6, 1, 3, 4]);   // fractions as results
stepCase('9减6等于3，3乘以8等于24', 'cards', '9 − 6 = 3; 3 × 8 = 24');                         // the 1 is not used
stepCase('9减6等于3，3乘以3等于9，9乘8乘1等于72', 'cards');                                    // a 3 that is no card nor result
stepCase('8加8等于16，16加9减1等于24', 'cards');                                              // 6 left over
stepCase('9加6等于15，15加8加1等于24', 'correct');
stepCase('9加6等于15，15减8乘1等于7', 'wrong', '9 + 6 = 15; 15 − 8 × 1 = 7');
stepCase('答案是九减六乘以八乘以一', 'correct', '(9 − 6) × 8 × 1');                           // "是" before the answer is not a step
stepCase('(9-6)×8×1=24', 'correct', '(9 − 6) × 8 × 1');                                     // one step reads as before
stepCase('(9-6)×8×1=24，二十四', 'correct', '(9 − 6) × 8 × 1');                             // a repeated result is no step
t('steps: a wrong step names what it makes and what was claimed', () => {
  const r = G.checkAny(['9减6等于4，4乘以8等于32'], S4);
  assert.deepStrictEqual([r.status, r.value, r.claimed, r.expr], ['wrong', '3', '4', '9 − 6']);
});
t('steps: no brackets spoken in a step, a bracketing gives the claimed result: 9减6乘8等于24 → (9 − 6) × 8', () => {
  const r = G.checkAny(['9减6乘8等于24，24乘1等于24'], S4);
  assert.strictEqual(r.status, 'correct', JSON.stringify(r));
});
/* ---------- R4: findings of R3 ---------- */
t('R3.1: twenty-one … ninety-nine read as one number', () => {
  assert.deepStrictEqual(['twenty-four', 'twenty four', 'thirty six', 'ninety-nine', 'twenty', 'forty'].map(w => G.tokenize(w).tokens.map(x => x.v)),
    [[24], [24], [36], [99], [20], [40]]);
});
t('R3.1: "twenty to" is not 22', () => assert.deepStrictEqual(G.tokenize('twenty to').tokens.map(x => x.v), [20, 2]));
stepCase('nine plus six equals fifteen, fifteen plus eight plus one is twenty-four', 'correct', '9 + 6 = 15; 15 + 8 + 1 = 24');
stepCase('nine plus six equals fifteen, fifteen plus eight plus one is twenty four', 'correct', '9 + 6 = 15; 15 + 8 + 1 = 24');
t('R3.3: Terry\'s sentence on 9 6 8 3 is not finished: 3 and 24 left', () => {
  const r = G.checkAny(['9减6等于3，3乘以8等于24'], [9, 6, 8, 3]);
  assert.deepStrictEqual([r.status, r.open, r.left], ['cards', true, ['3', '24']]);
});
t('R3.2: one right step with its result is not finished, with what is left', () => {
  const r = G.checkAny(['9减6等于3'], S4);
  assert.deepStrictEqual([r.status, r.open, r.left, r.expr], ['cards', true, ['8', '1', '3'], '9 − 6 = 3']);
});
t('R3.2: one wrong step with its result names the step', () => {
  const r = G.checkAny(['9减6等于4'], S4);
  assert.deepStrictEqual([r.status, r.value, r.claimed], ['wrong', '3', '4']);
});
t('R3.2: part of the cards with no result said is still "use the cards", marked partial', () => {
  const r = G.checkAny(['九减六'], S4);
  assert.deepStrictEqual([r.status, !!r.open, r.partial], ['cards', false, true]);
});
t('R3.2: a number that is no card is plain "use the cards" (not partial)', () => {
  const r = G.checkAny(['九减五'], S4);
  assert.deepStrictEqual([r.status, !!r.open, !!r.partial], ['cards', false, false]);
});
t('R3.2: a whole answer still reads as before: 8除以3减8除以3等于24 → correct, brackets added', () => {
  const r = G.checkAny(['8除以3减8除以3等于24'], [8, 3, 8, 3]);
  assert.deepStrictEqual([r.status, r.bracketsAdded], ['correct', true]);
});
t('R3.6: run together and right so far (9减6等于33×8等于24) → not finished, read as 3 and 3 × 8', () => {
  const r = G.checkAny(['9减6等于33×8等于24'], S4);
  assert.deepStrictEqual([r.status, r.open, r.expr], ['cards', true, '9 − 6 = 3; 3 × 8 = 24']);
});
t('R3.6: a claim whose split does not work stays as said and is reported: 9减6等于35乘以8 → claimed 35', () => {
  const r = G.checkAny(['9减6等于35乘以8等于40'], S4);
  assert.deepStrictEqual([r.status, r.value, r.claimed], ['wrong', '3', '35']);
});
t('R3.6: no split without an operator right after the claim: 9减6等于38，8乘1等于8 → claimed 38', () => {
  const r = G.checkAny(['9减6等于38，8乘1等于8'], S4);
  assert.deepStrictEqual([r.status, r.claimed], ['wrong', '38']);
});
t('splitSteps: one "= 24" at the end is one step (a plain answer)', () => assert.strictEqual(G.splitSteps(G.tokenize('8除以3减8除以3等于24').tokens).length, 1));
t('sound-alikes: 成 → 乘, 酒 → 九, 扩号 → 括号, 剪 → 减', () => assert.strictEqual(G.soundAlike('酒剪六成扩号'), '九减六乘括号'));
t('sound-alikes are a second reading: 九减六成八成一 → correct, heard shows what was said', () => {
  const r = G.checkAny(['九减六成八成一'], S4);
  assert.deepStrictEqual([r.status, r.heard], ['correct', '九减六成八成一']);
});
t('sound-alikes never undo a right reading: 八除以括号三减八除以三括号 stays correct', () =>
  assert.strictEqual(G.checkAny(['八除以括号三减八除以三括号'], [8, 3, 8, 3]).status, 'correct'));

/* ---------- home-screen icons (R1.5) ---------- */
t('apple-touch-icon and the manifest PNG icons exist, are PNGs of the right size, and are cached', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(/<link rel="apple-touch-icon" href="icons\/icon-180\.png">/.test(html));
  const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const want = { 'icons/icon-180.png': 180, 'icons/icon-192.png': 192, 'icons/icon-512.png': 512 };
  for (const src of ['icons/icon-192.png', 'icons/icon-512.png']) assert.ok(man.icons.some(i => i.src === src && i.type === 'image/png'), src);
  for (const [f, n] of Object.entries(want)) {
    const b = fs.readFileSync(path.join(ROOT, f));
    assert.strictEqual(b.toString('latin1', 1, 4), 'PNG', f);
    assert.deepStrictEqual([b.readUInt32BE(16), b.readUInt32BE(20)], [n, n], f);
    assert.ok(sw.includes(`'./${f}'`), `${f} not in sw.js`);
  }
});

console.log(`${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
