/* ============================================================
   Free Flow engine tests — run with:  node tests/freeflow-engine.test.js
   No dependencies, no build step. Exercises js/freeflow-engine.js
   (pure, DOM-free).

   Two properties matter, and they are different things:

   VALID — the flows partition the grid into orthogonally-connected
   simple paths of at least MIN_SEG cells. This guarantees a board is
   *solvable*: the generated paths themselves are a full-coverage
   solution.

   FORCED — the board has exactly *one* board-filling solution. This is
   what makes it play like Flow. A board can be perfectly valid and still
   admit hundreds of solutions, in which case nothing is ever deduced and
   the player just wiggles pipes until the grid fills. The generator's
   whole design exists to deliver this, so it is asserted directly.
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
  for (const size of [5, 7, 10, 11]) {
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
  const a = E.hamiltonianPath(7, E.makeRng(1)).join(',');
  const b = E.hamiltonianPath(7, E.makeRng(2)).join(',');
  check('ham: different seeds differ', a !== b);
  check('ham: same seed reproduces', a === E.hamiltonianPath(7, E.makeRng(1)).join(','));
}

/* ═══ 2. Segment cutting ═══ */
section('segment cutting');
{
  for (const [area, k] of [[25, 5], [49, 8], [100, 14], [121, 17]]) {
    for (let trial = 0; trial < 10; trial++) {
      const rng = E.makeRng(area * 100 + k * 10 + trial);
      const lengths = E.cutLengths(area, k, rng);
      const label = `cut area=${area} k=${k} seed ${trial}`;
      check(`${label}: k segments`, lengths.length === k);
      check(`${label}: sums to area`, lengths.reduce((s, x) => s + x, 0) === area);
      check(`${label}: all >= MIN_SEG`, lengths.every(l => l >= E.MIN_SEG), lengths.join(','));
    }
  }
}

/* ═══ 3. Solver correctness on hand-built boards ═══
   Small enough to reason about by hand, so a regression in the pruning
   shows up here rather than as a subtly wrong puzzle. */
section('solver');
{
  // 2x2, one colour per row — only one way to fill
  check('2x2 two rows: 1 solution', E.countSolutions(2, [[0, 1], [2, 3]], 5) === 1);

  // 3x3, one colour corner to corner: needs a Hamiltonian path 0->8, and
  // there are exactly two (down the left first, or across the top first)
  check('3x3 single colour: 2 solutions', E.countSolutions(3, [[0, 8]], 10) === 2);

  // 3x3, top-row corners and bottom-row corners. Colour the grid like a
  // checkerboard: 5 cells on the corner parity, 4 on the other. A path
  // between two same-parity cells uses one more of its own parity than
  // the other, so two such paths need 6 corner-parity cells and only 5
  // exist — no full-coverage solution can exist.
  check('3x3 parity obstruction: 0 solutions', E.countSolutions(3, [[0, 2], [6, 8]], 20) === 0);

  // a colour with both dots walled off from each other
  check('boxed-in colour: 0 solutions',
    E.countSolutions(3, [[0, 1], [2, 5], [3, 6], [4, 7]], 5) === 0);

  // dots that collide are rejected rather than mis-counted
  check('duplicate dot cells: 0 solutions', E.countSolutions(3, [[0, 4], [4, 8]], 5) === 0);
  check('degenerate dot pair: 0 solutions', E.countSolutions(3, [[0, 0], [4, 8]], 5) === 0);

  // the node cap reports "unknown" (-1) rather than a wrong answer
  check('node cap reports unknown', E.countSolutions(9, [[0, 80]], 2, 50) === -1);

  // a generated board's own solution must be findable
  let missed = 0;
  for (let s = 5; s <= 9; s++) {
    for (let i = 0; i < 6; i++) {
      const puz = E.generate({ size: s, difficulty: 'medium', rng: E.makeRng(s * 31 + i) });
      if (E.countSolutions(s, E.dotsOf(puz.flows), 1) < 1) missed++;
    }
  }
  check('every generated board is solvable', missed === 0, `${missed} unsolvable`);
}

/* ═══ 4. Generation: valid AND forced, every size and difficulty ═══ */
section('generation');
{
  let seed = 42;
  for (let size = E.SIZE_MIN; size <= E.SIZE_MAX; size++) {
    for (const diff of Object.keys(E.LEVELS)) {
      for (let trial = 0; trial < 2; trial++) {
        const rng = E.makeRng(seed++);
        const puz = E.generate({ size, difficulty: diff, rng });
        const label = `gen ${size}×${size} ${diff} #${trial}`;

        const errors = E.validate(puz);
        check(`${label}: structurally valid`, errors.length === 0, errors.slice(0, 3).join('; '));

        // the property the whole generator exists for
        check(`${label}: reports forced`, puz.unique === true);
        check(`${label}: really has one solution`,
          E.countSolutions(size, E.dotsOf(puz.flows), 2) === 1);

        check(`${label}: within palette`, puz.flows.length <= E.MAX_FLOWS, `${puz.flows.length}`);
        check(`${label}: at least the target`, puz.flows.length >= puz.targetFlows,
          `${puz.flows.length} < ${puz.targetFlows}`);

        const dots = puz.flows.flatMap(f => [f.cells[0], f.cells[f.cells.length - 1]]);
        check(`${label}: dots all distinct`, new Set(dots).size === dots.length);
      }
    }
  }
}

/* ═══ 5. Merge primitives ═══ */
section('merge primitives');
{
  // joining two flows whose ends touch yields one connected path
  const a = [0, 1, 2], b = [7, 6, 5];   // on a 5-wide grid: 2 and 7 touch
  const joined = E.joinFlows(a, b, 5);
  check('joinFlows: finds an orientation', !!joined);
  check('joinFlows: keeps every cell', joined && new Set(joined).size === 6);
  check('joinFlows: result is a path',
    E.validate({ size: 5, flows: [{ id: 0, cells: joined }] })
      .every(e => e.includes('not covered')));

  check('joinFlows: rejects non-touching flows', E.joinFlows([0, 1], [23, 24], 5) === null);

  const pairs = E.mergeablePairs([[0, 1, 2], [7, 6, 5], [20, 21, 22]], 5);
  check('mergeablePairs: finds the touching pair', pairs.length === 1 &&
    pairs[0][0] === 0 && pairs[0][1] === 1, JSON.stringify(pairs));
}

/* ═══ 6. Options and clamping ═══ */
section('options and clamping');
{
  const clampedSize = E.generate({ size: 99, difficulty: 'easy', rng: E.makeRng(9) });
  check('size clamped to SIZE_MAX', clampedSize.size === E.SIZE_MAX, `${clampedSize.size}`);
  check('size-clamped board valid', E.validate(clampedSize).length === 0);

  const small = E.generate({ size: 1, difficulty: 'easy', rng: E.makeRng(10) });
  check('size clamped to SIZE_MIN', small.size === E.SIZE_MIN, `${small.size}`);

  // opts.flows is a floor to merge toward, not an exact count
  const few = E.generate({ size: 7, flows: 4, rng: E.makeRng(7) });
  check('explicit flow target: valid', E.validate(few).length === 0);
  check('explicit flow target: still forced', few.unique === true);

  // the structural fast path skips the uniqueness work
  const fast = E.generate({ size: 9, difficulty: 'hard', rng: E.makeRng(11), unique: false });
  check('unique:false still returns a valid board', E.validate(fast).length === 0);
  check('unique:false reports not forced', fast.unique === false);
}

/* ═══ 7. Determinism ═══ */
section('determinism');
{
  const p1 = E.generate({ size: 9, difficulty: 'hard', rng: E.makeRng(1234) });
  const p2 = E.generate({ size: 9, difficulty: 'hard', rng: E.makeRng(1234) });
  check('same seed -> identical puzzle', JSON.stringify(p1) === JSON.stringify(p2));
  const p3 = E.generate({ size: 9, difficulty: 'hard', rng: E.makeRng(5678) });
  check('different seed -> different puzzle', JSON.stringify(p1) !== JSON.stringify(p3));
}

/* ═══ 8. validate() catches broken boards ═══ */
section('validator sanity');
{
  const good = E.generate({ size: 5, difficulty: 'easy', rng: E.makeRng(3) });
  check('validator passes a good board', E.validate(good).length === 0);

  const dupe = { size: 5, flows: good.flows.map(f => ({ id: f.id, cells: f.cells.slice() })) };
  dupe.flows[0].cells[1] = dupe.flows[1].cells[1];
  check('validator flags overlapping cells', E.validate(dupe).length > 0);

  const gap = { size: 5, flows: good.flows.map(f => ({ id: f.id, cells: f.cells.slice() })) };
  gap.flows[0].cells = gap.flows[0].cells.slice(0, -1);
  check('validator flags uncovered cells', E.validate(gap).length > 0);

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
