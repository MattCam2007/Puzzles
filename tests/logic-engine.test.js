/* ============================================================
   Logic Grid engine tests — run with:  node tests/logic-engine.test.js
   No dependencies, no build step. Exercises js/logic-engine.js
   (pure, DOM-free) plus the pack data contract in js/logic-packs.js.
   Generation is randomized, so most checks run as repeated trials.
   ============================================================ */
'use strict';

const path = require('path');
const vm = require('vm');
const fs = require('fs');

const E = require(path.join(__dirname, '..', 'js', 'logic-engine.js'));

/* logic-packs.js is a plain browser script (top-level consts) — evaluate it
   and read the consts back off the script's completion value. */
const packsSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'logic-packs.js'), 'utf8');
const { LOGIC_PACKS, LOGIC_THEMES } =
  vm.runInNewContext(packsSrc + '\n;({ LOGIC_PACKS, LOGIC_THEMES })', {});

/* ── micro test runner ── */
let passed = 0, failed = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { passed++; return true; }
  failed++;
  failures.push(name + (detail ? ' — ' + detail : ''));
  return false;
}
function section(title) { process.stdout.write('\n' + title + '\n'); }
function report(label) { process.stdout.write(`  ${label}\n`); }

/* ── helpers ── */
function clueHoldsInSolution(cl, entities, sol) {
  if (cl.type === 'positive') return sol[cl.cat][cl.e] === cl.val;
  if (cl.type === 'negative') return sol[cl.cat][cl.e] !== cl.val;
  if (cl.type === 'relational') {
    return sol[cl.cat1].indexOf(cl.val1) === sol[cl.cat2].indexOf(cl.val2);
  }
  // comparative
  const eA = sol[cl.refCat].indexOf(cl.refValA);
  const eB = sol[cl.refCat].indexOf(cl.refValB);
  return cl.ordValues.indexOf(sol[cl.ordCat][eA]) < cl.ordValues.indexOf(sol[cl.ordCat][eB]);
}

function validatePuzzle(p, diffKey, label) {
  const level = E.LEVELS[diffKey];
  if (!check(`${label}: generated`, !!p, 'generatePuzzle returned null')) return;
  check(`${label}: entity count`, p.entities.length === level.items);
  check(`${label}: category count`, p.attrCats.length === level.cats);
  check(`${label}: entities distinct`, new Set(p.entities).size === p.entities.length);
  const catNames = p.attrCats.map(c => c.name);
  check(`${label}: category names distinct`, new Set(catNames).size === catNames.length);

  for (const cat of p.attrCats) {
    check(`${label}: ${cat.name} has N values`, cat.values.length === level.items);
    check(`${label}: ${cat.name} values distinct`, new Set(cat.values).size === cat.values.length);
    const assigned = p.sol[cat.name];
    check(`${label}: ${cat.name} solution is a bijection`,
      assigned && assigned.length === level.items &&
      new Set(assigned).size === level.items &&
      assigned.every(v => cat.values.includes(v)));
    if (cat.ordinal) {
      // ordinal categories must keep their natural order in `values`
      const pool = (E.CATEGORY_POOL.find(c => c.name === cat.name) || {}).values;
      if (pool) {
        check(`${label}: ${cat.name} ordinal order preserved`,
          cat.values.every((v, i) => pool.indexOf(v) > (i === 0 ? -1 : pool.indexOf(cat.values[i - 1]))));
      }
    }
  }

  check(`${label}: has clues`, Array.isArray(p.clues) && p.clues.length > 0);
  const allTrue = p.clues.every(cl => clueHoldsInSolution(cl, p.entities, p.sol));
  check(`${label}: every clue true in solution`, allTrue);

  const nSols = E.countSolutions(p.entities, p.attrCats, p.clues, 2);
  check(`${label}: clue set admits exactly one solution`, nSols === 1, `count=${nSols}`);

  // clue text should never leak template placeholders or 'undefined'
  check(`${label}: clue text clean`,
    p.clues.every(cl => cl.text && !cl.text.includes('undefined') && !cl.text.includes('{')));
}

/* ═══ 1. random-pool generation, every difficulty ═══ */
section('1. Random generation validity');
{
  const TRIALS = { easy: 20, medium: 20, hard: 20, expert: 20 };
  for (const diff of Object.keys(E.LEVELS)) {
    let genMs = 0;
    for (let t = 0; t < TRIALS[diff]; t++) {
      const t0 = Date.now();
      const p = E.generatePuzzle(diff, null);
      genMs += Date.now() - t0;
      validatePuzzle(p, diff, `random/${diff}#${t}`);
    }
    report(`${diff}: ${TRIALS[diff]} puzzles, generation ${genMs}ms (validation excluded)`);
    // regression guard: generation runs on the UI thread — keep it snappy.
    // (Validation uses the exponential backtracking oracle and is test-only.)
    check(`${diff}: generation fast enough (avg < 150ms)`, genMs / TRIALS[diff] < 150,
      `avg ${(genMs / TRIALS[diff]).toFixed(0)}ms`);
  }
}

/* ═══ 1b. no-guessing guarantee + grade bands ═══ */
section('1b. Deduction solvability (no-guessing) + grade bands');
{
  for (const diff of Object.keys(E.LEVELS)) {
    const palette = E.LEVELS[diff].palette;
    const band = E.GRADE_BANDS[palette];
    for (let t = 0; t < 10; t++) {
      const p = E.generatePuzzle(diff, null);
      if (!check(`${diff}#${t}: generated`, !!p)) continue;
      const r = E.solveByDeduction(p.entities, p.attrCats, p.clues);
      check(`${diff}#${t}: solvable by pure deduction`, r.solved);
      if (r.solved) {
        // solver's derived assignment must equal the planted solution
        const agrees = p.attrCats.every(cat =>
          p.sol[cat.name].every((v, e) => r.sol[cat.name][e] === v));
        check(`${diff}#${t}: deduced solution matches planted solution`, agrees);
      }
      check(`${diff}#${t}: grade within band [${band.min},${band.max}]`,
        p.grade >= band.min && p.grade <= band.max, `grade=${p.grade}`);
    }
  }
  // solver sanity anchors
  const p = E.generatePuzzle('medium', null);
  check('solver: empty clue set is not "solved"',
    !E.solveByDeduction(p.entities, p.attrCats, []).solved);
  const allPositives = [];
  p.entities.forEach((name, e) => p.attrCats.forEach(cat => {
    allPositives.push({ type: 'positive', e, cat: cat.name, val: p.sol[cat.name][e] });
  }));
  const direct = E.solveByDeduction(p.entities, p.attrCats, allPositives);
  check('solver: full positives solve at grade 1', direct.solved && direct.grade === 1,
    `solved=${direct.solved} grade=${direct.grade}`);
}

/* ═══ 2. pack generation, every pack × difficulty ═══ */
section('2. Pack generation validity');
for (const pack of Object.values(LOGIC_PACKS)) {
  for (const diff of Object.keys(E.LEVELS)) {
    const label = `${pack.id}/${diff}`;
    const p = E.generatePuzzle(diff, pack);
    validatePuzzle(p, diff, label);
    if (!p) continue;

    // the whodunit contract: the culprit tell must be resolvable
    if (pack.culprit) {
      const col = p.sol[pack.culprit.category];
      check(`${label}: culprit category present`, !!col,
        `category ${pack.culprit.category} sliced out`);
      if (col) {
        check(`${label}: culprit value present`, col.includes(pack.culprit.value),
          `${pack.culprit.value} not among ${col}`);
      }
    }
    // every entity must have a sketch
    check(`${label}: sketches cover cast`, p.entities.every(e => !!pack.sketches[e]));
  }
}

/* ═══ 3. pack data contract ═══ */
section('3. Pack data contract');
for (const [id, pack] of Object.entries(LOGIC_PACKS)) {
  check(`${id}: id matches key`, pack.id === id);
  check(`${id}: theme exists`, !!LOGIC_THEMES[pack.theme]);
  check(`${id}: cast of 5`, pack.cast.length === 5);
  check(`${id}: ≥5 categories`, pack.categories.length >= 5);
  check(`${id}: every category has ≥5 values`,
    pack.categories.every(c => c.values.length >= 5));
  check(`${id}: has an ordinal category`, pack.categories.some(c => c.ordinal));
  if (pack.culprit) {
    const ci = pack.categories.findIndex(c => c.name === pack.culprit.category);
    check(`${id}: culprit category within first 3`, ci >= 0 && ci < 3,
      `index ${ci} — easy uses only the first 3 categories`);
    const cat = pack.categories[ci];
    check(`${id}: culprit value exists in category`, cat && cat.values.includes(pack.culprit.value));
    check(`${id}: has verdict with {name}`, !!pack.verdict && pack.verdict.includes('{name}'));
  }
  const asides = (LOGIC_THEMES[pack.theme] || {}).asides || [];
  check(`${id}: theme has ≥5 asides (one per cast member)`, asides.length >= 5);
}

/* ═══ 4. unit checks on engine pieces ═══ */
section('4. Engine unit checks');
{
  // sliceKeeping: keeps `must`, right length, no dupes
  for (let t = 0; t < 20; t++) {
    const out = E.sliceKeeping(['a', 'b', 'c', 'd', 'e'], 4, 'e');
    check('sliceKeeping keeps must', out.includes('e'), out.join(','));
    check('sliceKeeping length', out.length === 4);
    check('sliceKeeping distinct', new Set(out).size === 4);
  }
  // pickCategories: hard/expert always get an ordinal category
  for (let t = 0; t < 20; t++) {
    const cats = E.pickCategories(E.LEVELS.hard, 'hard');
    check('pickCategories(hard) has ordinal', cats.some(c => c.ordinal));
    check('pickCategories(hard) distinct', new Set(cats.map(c => c.name)).size === cats.length);
  }
  // countSolutions: sanity on a hand-built 2×2 case
  const ents = ['A', 'B'];
  const cats = [{ name: 'X', values: ['x1', 'x2'] }];
  check('countSolutions unconstrained 2×2 = 2',
    E.countSolutions(ents, cats, [], 10) === 2);
  check('countSolutions with one positive = 1',
    E.countSolutions(ents, cats, [{ type: 'positive', e: 0, cat: 'X', val: 'x1' }], 10) === 1);
  check('countSolutions with contradictory positives = 0',
    E.countSolutions(ents, cats, [
      { type: 'positive', e: 0, cat: 'X', val: 'x1' },
      { type: 'positive', e: 0, cat: 'X', val: 'x2' },
    ], 10) === 0);
}

/* ═══ summary ═══ */
process.stdout.write(`\n${passed} passed, ${failed} failed\n`);
if (failures.length) {
  process.stdout.write('\nFailures:\n' + failures.map(f => '  ✗ ' + f).join('\n') + '\n');
  process.exit(1);
}
