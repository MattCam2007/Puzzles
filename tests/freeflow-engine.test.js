/* ============================================================
   Free Flow engine tests — run with:  node tests/freeflow-engine.test.js
   No dependencies, no build step. Exercises js/freeflow-engine.js
   (pure, DOM-free). Generation is randomized, so the structural
   checks run as repeated seeded trials across every board size and
   difficulty. What "valid" means here:
     - the flows partition the grid (every cell in exactly one flow)
     - every flow is an orthogonally-connected simple path
     - every flow has at least MIN_SEG cells (distinct dots guaranteed)
     - the flow count matches the difficulty formula and its bounds
   Together these prove each board has a non-crossing, full-coverage
   solution: the generated paths themselves.
   ============================================================ */
'use strict';

const path = require('path');
const E = require(path.join(__dirname, '..', 'js', 'freeflow-engine.js'));

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

/* ═══ 1. Hamiltonian path machinery ═══ */
section('hamiltonian path');
{
  for (const size of [5, 7, 10, 14]) {
    for (let trial = 0; trial < 5; trial++) {
      const rng = E.makeRng(size * 1000 + trial);
      const p = E.hamiltonianPath(size, rng);
      const n = size * size;
      const label = `ham ${size}×${size} seed ${trial}`;
      check(`${label}: covers every cell once`, p.length === n && new Set(p).size === n);
      let adjacent = true;
      for (let i = 1; i < n; i++) {
        const a = p[i - 1], b = p[i];
        const diff = Math.abs(a - b);
        const sameRow = Math.floor(a / size) === Math.floor(b / size);
        if (!(diff === size || (diff === 1 && sameRow))) { adjacent = false; break; }
      }
      check(`${label}: consecutive cells adjacent`, adjacent);
    }
  }
  // backbite must actually randomize: two seeds should not produce the
  // same path (probability of collision is negligible)
  const a = E.hamiltonianPath(7, E.makeRng(1)).join(',');
  const b = E.hamiltonianPath(7, E.makeRng(2)).join(',');
  check('ham: different seeds differ', a !== b);
  const a2 = E.hamiltonianPath(7, E.makeRng(1)).join(',');
  check('ham: same seed reproduces', a === a2);
}

/* ═══ 2. Flow-count formula bounds ═══ */
section('flow count formula');
{
  for (let size = E.SIZE_MIN; size <= E.SIZE_MAX; size++) {
    for (const [diff, level] of Object.entries(E.LEVELS)) {
      const k = E.flowCountFor(size, level.targetLen);
      const area = size * size;
      const label = `flows ${size}×${size} ${diff}`;
      check(`${label}: at least 3`, k >= 3, `got ${k}`);
      check(`${label}: within palette`, k <= E.MAX_FLOWS, `got ${k}`);
      check(`${label}: min length feasible`, k * E.MIN_SEG <= area, `k=${k} area=${area}`);
    }
  }
  // harder difficulties never yield more flows than easier ones (longer
  // average paths = fewer flows on the same board)
  for (let size = E.SIZE_MIN; size <= E.SIZE_MAX; size++) {
    const ks = ['easy', 'medium', 'hard', 'expert'].map(d => E.flowCountFor(size, E.LEVELS[d].targetLen));
    check(`flows ${size}×${size}: monotone easy≥…≥expert`,
      ks[0] >= ks[1] && ks[1] >= ks[2] && ks[2] >= ks[3], ks.join(','));
  }
}

/* ═══ 3. Segment cutting ═══ */
section('segment cutting');
{
  for (const [area, k] of [[25, 5], [49, 8], [121, 12], [196, 16]]) {
    for (let trial = 0; trial < 10; trial++) {
      const rng = E.makeRng(area * 100 + k * 10 + trial);
      const lengths = E.cutLengths(area, k, rng);
      const label = `cut area=${area} k=${k} seed ${trial}`;
      check(`${label}: k segments`, lengths.length === k);
      check(`${label}: sums to area`, lengths.reduce((s, x) => s + x, 0) === area);
      check(`${label}: all ≥ MIN_SEG`, lengths.every(l => l >= E.MIN_SEG), lengths.join(','));
    }
  }
}

/* ═══ 4. Full generation — every size × difficulty ═══ */
section('generation (validity across all sizes and difficulties)');
{
  let seed = 42;
  for (let size = E.SIZE_MIN; size <= E.SIZE_MAX; size++) {
    for (const diff of Object.keys(E.LEVELS)) {
      for (let trial = 0; trial < 3; trial++) {
        const rng = E.makeRng(seed++);
        const puz = E.generate({ size, difficulty: diff, rng });
        const label = `gen ${size}×${size} ${diff} #${trial}`;
        const errors = E.validate(puz);
        check(`${label}: structurally valid`, errors.length === 0, errors.slice(0, 3).join('; '));
        check(`${label}: flow count matches formula`,
          puz.flows.length === E.flowCountFor(size, E.LEVELS[diff].targetLen),
          `got ${puz.flows.length}`);
        const dots = puz.flows.flatMap(f => [f.cells[0], f.cells[f.cells.length - 1]]);
        check(`${label}: dots all distinct`, new Set(dots).size === dots.length);
      }
    }
  }
}

/* ═══ 5. Explicit flow-count override + clamping ═══ */
section('overrides and clamping');
{
  const rng = E.makeRng(7);
  const puz = E.generate({ size: 7, flows: 6, rng });
  check('override: explicit flow count honoured', puz.flows.length === 6, `got ${puz.flows.length}`);
  check('override: still valid', E.validate(puz).length === 0);

  const huge = E.generate({ size: 5, flows: 99, rng: E.makeRng(8) });
  check('override: clamped to area/MIN_SEG and palette',
    huge.flows.length === Math.min(E.MAX_FLOWS, Math.floor(25 / E.MIN_SEG)),
    `got ${huge.flows.length}`);
  check('override: clamped board still valid', E.validate(huge).length === 0);

  const clampedSize = E.generate({ size: 99, difficulty: 'easy', rng: E.makeRng(9) });
  check('size clamped to SIZE_MAX', clampedSize.size === E.SIZE_MAX, `got ${clampedSize.size}`);
  check('size-clamped board valid', E.validate(clampedSize).length === 0);
}

/* ═══ 6. Determinism ═══ */
section('determinism');
{
  const p1 = E.generate({ size: 9, difficulty: 'hard', rng: E.makeRng(1234) });
  const p2 = E.generate({ size: 9, difficulty: 'hard', rng: E.makeRng(1234) });
  check('same seed → identical puzzle', JSON.stringify(p1) === JSON.stringify(p2));
  const p3 = E.generate({ size: 9, difficulty: 'hard', rng: E.makeRng(5678) });
  check('different seed → different puzzle', JSON.stringify(p1) !== JSON.stringify(p3));
}

/* ═══ 7. validate() catches broken boards ═══ */
section('validator sanity');
{
  const good = E.generate({ size: 5, difficulty: 'easy', rng: E.makeRng(3) });
  check('validator passes a good board', E.validate(good).length === 0);

  const dupe = { size: 5, flows: good.flows.map(f => ({ id: f.id, cells: f.cells.slice() })) };
  dupe.flows[0].cells[1] = dupe.flows[1].cells[1];   // overlap two flows
  check('validator flags overlapping cells', E.validate(dupe).length > 0);

  const gap = { size: 5, flows: good.flows.map(f => ({ id: f.id, cells: f.cells.slice() })) };
  gap.flows[0].cells = gap.flows[0].cells.slice(0, -1);  // uncovered cell (and possibly short flow)
  check('validator flags uncovered cells', E.validate(gap).length > 0);

  // hand-built board with a diagonal jump: cells 0 → 6 are not neighbours
  const jump = { size: 5, flows: [{ id: 0, cells: [0, 6, 7] }] };
  check('validator flags non-adjacent steps',
    E.validate(jump).some(e => e.includes('not orthogonally adjacent')));
}

/* ── report ── */
process.stdout.write(`\n${passed} passed, ${failed} failed\n`);
if (failures.length) {
  process.stdout.write('\nFailures:\n');
  for (const f of failures) process.stdout.write('  ✘ ' + f + '\n');
  process.exitCode = 1;
}
