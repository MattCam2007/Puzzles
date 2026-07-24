/* ============================================================
   Abacus engine tests — run with:  node tests/abacus-engine.test.js
   No dependencies, no build step. Exercises js/abacus-engine.js
   (pure, DOM-free). Generation is randomized in production but every
   test here drives it through a seeded RNG so results are
   deterministic and repeatable.
   ============================================================ */
'use strict';

const path = require('path');
const E = require(path.join(__dirname, '..', 'js', 'abacus-engine.js'));

/* ── micro test runner (same shape as tests/logic-engine.test.js) ── */
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

/* ── seeded RNG: mulberry32, deterministic, dependency-free ── */
function seededRng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STYLE_NAMES = ['soroban', 'suanpan', 'roman', 'schoty'];
const DIFFICULTIES = ['easy', 'medium', 'hard', 'expert'];

/* ═══════════════════════════════════════════
   PHASE 1 — core value + question generation
═══════════════════════════════════════════ */
section('1. abacusValue / freshState / setValue / maxBoardValue');

{
  const S = E.STYLES.soroban;
  const state = E.freshState('soroban');
  check('freshState: soroban has 9 rods', state.length === 9);
  check('freshState: soroban rods are {h:0,e:0}', state.every(r => r.h === 0 && r.e === 0));

  const st2 = E.freshState('soroban');
  st2[8] = { h: 1, e: 2 };
  check('abacusValue: heaven*5 + earth in ones place = 7', E.abacusValue(st2, 'soroban') === 7);

  const schotyState = E.freshState('schoty');
  check('freshState: schoty rods are plain numbers', schotyState.every(r => typeof r === 'number' && r === 0));
}

for (const style of STYLE_NAMES) {
  const cap = E.maxBoardValue(style);
  check(`maxBoardValue(${style}): equals 10^rods - 1`, cap === Math.pow(10, E.STYLES[style].rods) - 1);

  const samples = [0, 1, 9, 10, 99, 5, 50, 12345, cap];
  for (const n of samples) {
    const st = E.setValue(n, style);
    const back = E.abacusValue(st, style);
    check(`setValue round-trip: ${style} n=${n}`, back === n, `got ${back}`);
  }
}

section('2. toggleBead — prefix semantics');
{
  const st = E.freshState('soroban');
  // clicking earth bead index 2 when count is 0 should set count to 3 (prefix up)
  const st1 = E.toggleBead(st, 'soroban', 8, 'e', 2);
  check('toggleBead: click above current count sets to i+1', st1[8].e === 3, `got ${st1[8].e}`);
  // clicking earth bead index 1 when count is 3 should retract to 1
  const st2 = E.toggleBead(st1, 'soroban', 8, 'e', 1);
  check('toggleBead: click within current count retracts to i', st2[8].e === 1, `got ${st2[8].e}`);
  check('toggleBead: does not mutate input', st1[8].e === 3, 'input state was mutated');

  const rowSt = E.freshState('schoty');
  const rowSt1 = E.toggleBead(rowSt, 'schoty', 3, null, 4);
  check('toggleBead: schoty row sets to i+1', rowSt1[3] === 5, `got ${rowSt1[3]}`);
  const rowSt2 = E.toggleBead(rowSt1, 'schoty', 3, null, 1);
  check('toggleBead: schoty row retracts to i', rowSt2[3] === 1, `got ${rowSt2[3]}`);
}

section('3. genQuestion — determinism');
{
  const cfg = { difficulty: 'medium', style: 'soroban', chainLen: 3, ops: { add: true, sub: true, mul: true, div: true } };
  const q1 = E.genQuestion(cfg, seededRng(42));
  const q2 = E.genQuestion(cfg, seededRng(42));
  check('genQuestion: same seed + cfg -> identical question', q1.text === q2.text && q1.answer === q2.answer,
    `${q1.text} (${q1.answer}) vs ${q2.text} (${q2.answer})`);
}

section('4. genQuestion — integrity sweep (difficulty x chainLen x style x seed)');
{
  let totalChecked = 0;
  const opsForCheck = { add: true, sub: true, mul: true, div: true };
  for (const style of STYLE_NAMES) {
    for (const difficulty of DIFFICULTIES) {
      for (let chainLen = 2; chainLen <= 6; chainLen++) {
        for (let seed = 0; seed < 200; seed++) {
          const cfg = { difficulty, style, chainLen, ops: opsForCheck };
          const q = E.genQuestion(cfg, seededRng(seed * 97 + chainLen));
          totalChecked++;
          const cap = E.maxBoardValue(style);

          if (!check(`text non-empty (${style}/${difficulty}/c${chainLen}/s${seed})`,
              !!q.text && q.text.trim() !== '=' && q.text.trim() !== '')) continue;

          check(`answer in range (${style}/${difficulty}/c${chainLen}/s${seed})`,
            q.answer >= 0 && q.answer <= cap, `answer=${q.answer} cap=${cap}`);

          const symByOp = { add: ' + ', sub: ' − ', mul: ' × ', div: ' ÷ ' };
          const sym = symByOp[q.op];
          const parts = q.text.replace(/\s*=\s*$/, '').split(sym).map(x => Number(x.replace(/,/g, '')));
          check(`operand count matches chainLen (${style}/${difficulty}/c${chainLen}/s${seed})`,
            parts.length === chainLen, `got ${parts.length} parts`);

          if (q.op === 'sub') {
            check(`sub: answer >= 0 (${style}/${difficulty}/c${chainLen}/s${seed})`, q.answer >= 0);
          }
          if (q.op === 'div') {
            let v = parts[0];
            let clean = true;
            for (let i = 1; i < parts.length; i++) {
              if (parts[i] === 0 || v % parts[i] !== 0) { clean = false; break; }
              v /= parts[i];
            }
            check(`div: divides evenly at every step (${style}/${difficulty}/c${chainLen}/s${seed})`,
              clean && v === q.answer, `${q.text} -> v=${v} answer=${q.answer}`);
          }
        }
      }
    }
  }
  report(`checked ${totalChecked} generated questions across styles/difficulties/chainLens/seeds`);
}

section('5. genQuestion — only enabled operations appear');
{
  for (const onlyOp of ['add', 'sub', 'mul', 'div']) {
    const ops = { add: false, sub: false, mul: false, div: false };
    ops[onlyOp] = true;
    const cfg = { difficulty: 'medium', style: 'soroban', chainLen: 2, ops };
    let allMatch = true;
    for (let seed = 0; seed < 50; seed++) {
      const q = E.genQuestion(cfg, seededRng(seed));
      if (q.op !== onlyOp) allMatch = false;
    }
    check(`genQuestion: only ${onlyOp} appears when only ${onlyOp} enabled`, allMatch);
  }
}

section('6. genQuestion — guaranteed-solvable fallback on a tiny board (D5/D6)');
{
  // synthetic 1-rod style forces the mul/div attempt loops to exhaust
  const tinyStyles = Object.assign({}, E.STYLES, {
    tiny: { kind: 'vertical', rods: 1, heaven: 1, earth: 4 },
  });
  const cfg = { difficulty: 'expert', style: 'tiny', chainLen: 4, ops: { mul: true } };
  let allOk = true, sample = null;
  for (let seed = 0; seed < 100; seed++) {
    const q = E.genQuestion(cfg, seededRng(seed), tinyStyles);
    sample = q;
    if (!q.text || q.text.trim() === '=' || q.answer > 9) allOk = false;
  }
  check('genQuestion: tiny board never produces empty/over-cap question', allOk,
    sample ? `last sample: "${sample.text}" answer=${sample.answer}` : 'no samples');
}

section('7. bestKey — D2 regression: keys must not collide across chainLen/ops');
{
  const base = { difficulty: 'easy', trialSecs: 60, chainLen: 2, ops: { add: true, sub: false, mul: false, div: false } };
  check('D2: best key separates chain length',
    E.bestKey(Object.assign({}, base, { chainLen: 2 })) !== E.bestKey(Object.assign({}, base, { chainLen: 6 })));
  check('D2: best key separates op mix',
    E.bestKey(Object.assign({}, base, { ops: { add: true } })) !== E.bestKey(Object.assign({}, base, { ops: { div: true } })));
  check('D2: best key is stable for identical cfg',
    E.bestKey(base) === E.bestKey(Object.assign({}, base)));
}

/* ── summary ── */
process.stdout.write(`\n${passed} passed, ${failed} failed\n`);
if (failed) {
  process.stdout.write('\nFailures:\n');
  failures.forEach(f => process.stdout.write(`  ✘ ${f}\n`));
  process.exitCode = 1;
}
