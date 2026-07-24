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

/* ═══════════════════════════════════════════
   PHASE 2 — responsive scaling (styleUnits / computeUnit)
═══════════════════════════════════════════ */
section('8. styleUnits — board size in abstract units');
{
  const soroU = E.styleUnits('soroban');
  const suanU = E.styleUnits('suanpan');
  check('styleUnits: suanpan is taller than soroban (more heaven+earth beads)',
    suanU.h > soroU.h, `soroban.h=${soroU.h} suanpan.h=${suanU.h}`);

  const schotyU = E.styleUnits('schoty');
  const romanU = E.styleUnits('roman');
  check('styleUnits: soroban (9 rods) is wider than roman (7 rods)',
    soroU.w > romanU.w, `soroban.w=${soroU.w} roman.w=${romanU.w}`);
  check('styleUnits: schoty has finite positive dimensions', schotyU.w > 0 && schotyU.h > 0);

  for (const style of STYLE_NAMES) {
    const u = E.styleUnits(style);
    check(`styleUnits(${style}): positive w/h`, u.w > 0 && u.h > 0, `w=${u.w} h=${u.h}`);
  }
}

section('9. computeUnit — fits, clamps, maximises');
{
  const opts = { min: 9, max: 46 };
  for (const style of STYLE_NAMES) {
    const u = E.styleUnits(style);

    // fits: unit * dimension never exceeds the available box (+ float slop)
    for (const [w, h] of [[800, 400], [390, 844], [1280, 800], [1024, 768]]) {
      const unit = E.computeUnit(w, h, style, opts);
      check(`computeUnit(${style}, ${w}x${h}): fits width`, unit * u.w <= w + 0.01,
        `unit=${unit} w=${unit * u.w} avail=${w}`);
      check(`computeUnit(${style}, ${w}x${h}): fits height`, unit * u.h <= h + 0.01,
        `unit=${unit} h=${unit * u.h} avail=${h}`);
    }

    // monotonic: a strictly larger box never yields a smaller unit
    const small = E.computeUnit(400, 300, style, opts);
    const big = E.computeUnit(1200, 900, style, opts);
    check(`computeUnit(${style}): monotonic in box size`, big >= small, `small=${small} big=${big}`);

    // clamped
    const tiny = E.computeUnit(10, 10, style, opts);
    const huge = E.computeUnit(100000, 100000, style, opts);
    check(`computeUnit(${style}): clamped to min`, tiny >= opts.min - 0.01, `got ${tiny}`);
    check(`computeUnit(${style}): clamped to max`, huge <= opts.max + 0.01, `got ${huge}`);

    // width-bound vs height-bound
    const wideShort = E.computeUnit(4000, 300, style, opts);
    const tallNarrow = E.computeUnit(300, 4000, style, opts);
    check(`computeUnit(${style}): wide-short box is height-bound`,
      Math.abs(wideShort * u.h - 300) < 0.5 || wideShort === opts.max,
      `unit=${wideShort} h*unit=${wideShort * u.h}`);
    check(`computeUnit(${style}): tall-narrow box is width-bound`,
      Math.abs(tallNarrow * u.w - 300) < 0.5 || tallNarrow === opts.max,
      `unit=${tallNarrow} w*unit=${tallNarrow * u.w}`);

    // maximises: at least one axis is within 1% of exact fit for an
    // unclamped box (avoid min/max clamp cases which needn't fill either axis)
    const box = { w: 500, h: 350 };
    const unit = E.computeUnit(box.w, box.h, style, opts);
    if (unit > opts.min && unit < opts.max) {
      const wErr = Math.abs(unit * u.w - box.w) / box.w;
      const hErr = Math.abs(unit * u.h - box.h) / box.h;
      check(`computeUnit(${style}): maximises at least one axis`,
        wErr < 0.01 || hErr < 0.01, `wErr=${wErr} hErr=${hErr}`);
    }
  }
}

/* ═══════════════════════════════════════════
   PHASE 3 — kinetic beads (pure track physics)
   A "group" (the heaven beads on a rod, the earth beads on a rod, or
   one schoty row) is modelled as a 1D track: position 0 = touching the
   "active" wall, position increases moving away from it. A bead's rest
   position (when not being dragged) is index * beadSize if it's active
   (i < count) or (index + 1) * beadSize if it's inactive — the same
   one-slot gap js/abacus.js's renderBeads() already draws between the
   active and inactive clusters (a real abacus's beads visibly separate
   into two touching groups, not one continuous line — removing the gap
   would mean toggling a bead's state never actually moves it, which
   defeats the point of a "kinetic" abacus). shovePositions() takes the
   group's count so its live-drag positions start out exactly equal to
   renderBeads()'s rest positions — no phantom jump the instant a drag
   begins, before the pointer has even moved.
═══════════════════════════════════════════ */
section('10. beadsFromTrack — continuous position to discrete count');
{
  const groupSize = 5, beadSize = 20;
  const cases = [
    [0, 0], [0.4 * beadSize, 0], [0.6 * beadSize, 1],
    [2.5 * beadSize, 3], [99 * beadSize, groupSize], [-10, 0],
  ];
  for (const [t, expected] of cases) {
    const got = E.beadsFromTrack(t, groupSize, beadSize);
    check(`beadsFromTrack(${t}, ${groupSize}, ${beadSize}) === ${expected}`, got === expected, `got ${got}`);
  }
}

section('11. shovePositions — drag physics (shove ahead, never pull behind)');
{
  const beadSize = 20, groupSize = 5;
  const restPos = (i, count) => (i < count ? i : i + 1) * beadSize;
  const trackMax = groupSize * beadSize;

  // no movement yet: every bead (including the dragged one) must sit
  // exactly at its rest position — no phantom jump the instant a drag
  // starts, before the pointer has moved
  {
    for (let count = 0; count <= groupSize; count++) {
      for (let dragIndex = 0; dragIndex < groupSize; dragIndex++) {
        const pos = E.shovePositions(count, groupSize, dragIndex, restPos(dragIndex, count), beadSize);
        let allAtRest = true;
        for (let i = 0; i < groupSize; i++) {
          if (Math.abs(pos[i] - restPos(i, count)) > 1e-9) allAtRest = false;
        }
        check(`shove: zero-movement matches rest exactly (count=${count}, dragIndex=${dragIndex})`, allAtRest,
          `got ${pos} expected ${Array.from({length: groupSize}, (_, i) => restPos(i, count))}`);
      }
    }
  }

  // count=2 (beads 0,1 active; bead 2 rests at (2+1)*20=60): dragging
  // bead 2 toward the wall shoves the already-active beads 0-1 inward
  // (they get carried along), but beads 3-4 (on the far side) are
  // untouched — you can't pull beads that are "behind" the drag
  {
    const pos = E.shovePositions(2, groupSize, 2, 10, beadSize);
    check('shove-toward-wall: dragged bead sits at dragPos', pos[2] === 10, `got ${pos[2]}`);
    check('shove-toward-wall: bead 1 shoved to dragPos - beadSize', pos[1] === -10, `got ${pos[1]}`);
    check('shove-toward-wall: bead 0 shoved to dragPos - 2*beadSize', pos[0] === -30, `got ${pos[0]}`);
    check('shove-toward-wall: bead 3 untouched at rest (behind, not pulled)', pos[3] === restPos(3, 2), `got ${pos[3]}`);
    check('shove-toward-wall: bead 4 untouched at rest (behind, not pulled)', pos[4] === restPos(4, 2), `got ${pos[4]}`);
  }

  // count=3 (beads 0,1,2 active; bead 2 rests at 2*20=40): dragging bead
  // 2 away from the wall shoves the inactive beads 3-4 outward, but
  // beads 0-1 (already active, on the wall side) are untouched
  {
    const pos = E.shovePositions(3, groupSize, 2, 70, beadSize);
    check('shove-away-from-wall: dragged bead sits at dragPos', pos[2] === 70, `got ${pos[2]}`);
    check('shove-away-from-wall: bead 3 shoved to dragPos + beadSize', pos[3] === 90, `got ${pos[3]}`);
    check('shove-away-from-wall: bead 4 shoved to dragPos + 2*beadSize', pos[4] === 110, `got ${pos[4]}`);
    check('shove-away-from-wall: bead 0 untouched at rest', pos[0] === restPos(0, 3), `got ${pos[0]}`);
    check('shove-away-from-wall: bead 1 untouched at rest', pos[1] === restPos(1, 3), `got ${pos[1]}`);
  }

  // dragPos is clamped to the track: [0, groupSize*beadSize]
  {
    const posLow = E.shovePositions(0, groupSize, 0, -500, beadSize);
    check('shove: dragPos clamped below track start', posLow[0] === 0, `got ${posLow[0]}`);
    const posHigh = E.shovePositions(0, groupSize, 4, 5000, beadSize);
    check('shove: dragPos clamped above track end', posHigh[4] === trackMax, `got ${posHigh[4]}`);
  }

  // general properties, fuzzed across many count/groupSize/dragIndex/dragPos combos
  {
    let monotonicOk = true, minSpacingOk = true, exactDragOk = true;
    for (let groupSize2 = 2; groupSize2 <= 7; groupSize2++) {
      for (let count = 0; count <= groupSize2; count++) {
        for (let dragIndex = 0; dragIndex < groupSize2; dragIndex++) {
          for (let t = 0; t < 12; t++) {
            const dragPos = -50 + t * 17.3; // sweep across and beyond the track
            const pos = E.shovePositions(count, groupSize2, dragIndex, dragPos, beadSize);
            for (let i = 0; i < groupSize2 - 1; i++) {
              if (pos[i + 1] - pos[i] < beadSize - 1e-9) minSpacingOk = false;
              if (pos[i + 1] < pos[i]) monotonicOk = false;
            }
            const clampedExpected = Math.max(0, Math.min(groupSize2 * beadSize, dragPos));
            if (Math.abs(pos[dragIndex] - clampedExpected) > 1e-9) exactDragOk = false;
          }
        }
      }
    }
    check('shove: positions always monotonic (fuzzed)', monotonicOk);
    check('shove: adjacent spacing always >= beadSize (fuzzed)', minSpacingOk);
    check('shove: dragged bead always at clamped dragPos (fuzzed)', exactDragOk);
  }

  // does not mutate any input (there is no mutable input object in this
  // design — count/groupSize/dragIndex/dragPos/beadSize are all
  // primitives — but two calls with identical primitive args must be
  // independent arrays)
  {
    const a = E.shovePositions(2, groupSize, 2, 10, beadSize);
    const b = E.shovePositions(2, groupSize, 2, 10, beadSize);
    a[0] = 99999;
    check('shove: returned arrays are independent (no shared mutable state)', b[0] !== 99999, `got ${b[0]}`);
  }
}

section('12. flingTarget — decisive flick overrides normal quantization');
{
  const groupSize = 5, threshold = 0.5;
  check('fling: below threshold leaves count unchanged', E.flingTarget(0.1, 2, groupSize, threshold) === 2);
  check('fling: below threshold (negative) leaves count unchanged', E.flingTarget(-0.2, 3, groupSize, threshold) === 3);
  check('fling: fast toward the wall (negative) -> full count', E.flingTarget(-5, 1, groupSize, threshold) === groupSize);
  check('fling: fast away from the wall (positive) -> zero', E.flingTarget(5, 4, groupSize, threshold) === 0);
  // spec is strictly "< threshold" stays unchanged, so a velocity
  // exactly at the threshold already counts as decisive (fires, per the
  // positive-velocity/away-from-wall rule -> 0), not "unchanged"
  check('fling: velocity exactly at threshold already fires (boundary is exclusive)',
    E.flingTarget(threshold, 2, groupSize, threshold) === 0);
}

section('13. snapPositions — every result is an exact multiple of beadSize (A12)');
{
  const beadSize = 20;
  const inputs = [
    [0, 20, 40, 60, 80],           // already exact
    [3.2, 21.9, 38.4, 71.1, 79.9], // fuzzy, independent
    E.shovePositions(2, 5, 2, 13.7, beadSize), // realistic drag output
  ];
  for (const freePositions of inputs) {
    const snapped = E.snapPositions(freePositions, beadSize);
    check(`snapPositions: same length as input`, snapped.length === freePositions.length);
    const allExact = snapped.every(p => Math.abs(p / beadSize - Math.round(p / beadSize)) < 1e-9);
    check(`snapPositions: every value is an exact multiple of beadSize`, allExact, `got ${snapped}`);
  }
}

/* ═══════════════════════════════════════════
   PHASE 4 — migrateCfg (auto-advance by default, collapse modes)
═══════════════════════════════════════════ */
section('14. migrateCfg — v1 configs migrate to the v2 shape');
{
  const cases = [
    [{ mode: 'flow' }, { mode: 'practice', requireCheck: false }],
    [{ mode: 'practice' }, { mode: 'practice', requireCheck: false }],
    [{ mode: 'trial' }, { mode: 'trial', requireCheck: false }],
    [{ mode: 'freestyle' }, { mode: 'freestyle', requireCheck: false }],
    [{}, { mode: 'practice', requireCheck: false }],
    [{ mode: 'nonsense' }, { mode: 'practice', requireCheck: false }],
  ];
  for (const [input, expected] of cases) {
    const got = E.migrateCfg(input);
    check(`migrateCfg(${JSON.stringify(input)}): mode -> ${expected.mode}`, got.mode === expected.mode, `got ${got.mode}`);
    check(`migrateCfg(${JSON.stringify(input)}): requireCheck -> ${expected.requireCheck}`,
      got.requireCheck === expected.requireCheck, `got ${got.requireCheck}`);
  }

  // appearance keys absent in a v1 cfg get filled with sane defaults
  const migrated = E.migrateCfg({ mode: 'practice' });
  check('migrateCfg: beadShape defaults to "auto"', migrated.beadShape === 'auto', `got ${migrated.beadShape}`);
  check('migrateCfg: beadMaterial defaults to "themed"', migrated.beadMaterial === 'themed', `got ${migrated.beadMaterial}`);

  // idempotent: an already-migrated cfg passes through unchanged
  const once = E.migrateCfg({ mode: 'trial' });
  const twice = E.migrateCfg(once);
  check('migrateCfg: idempotent', JSON.stringify(once) === JSON.stringify(twice),
    `${JSON.stringify(once)} vs ${JSON.stringify(twice)}`);

  // does not mutate the input
  const input = { mode: 'flow' };
  E.migrateCfg(input);
  check('migrateCfg: does not mutate its input', input.mode === 'flow', `got ${input.mode}`);
}

/* ── summary ── */
process.stdout.write(`\n${passed} passed, ${failed} failed\n`);
if (failed) {
  process.stdout.write('\nFailures:\n');
  failures.forEach(f => process.stdout.write(`  ✘ ${f}\n`));
  process.exitCode = 1;
}
