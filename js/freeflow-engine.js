/* ═══════════════════════════════════════════
   Free Flow — puzzle engine (pure, DOM-free)
   Board generation only: no rendering, no storage, no globals from
   the page. Loaded in the browser as `FlowEngine` (before
   js/freeflow.js) and require()-able from Node for the test suite:

     node tests/freeflow-engine.test.js

   Keep this file free of document/window/localStorage references.

   ── Why every generated board is solvable ──
   1. A Hamiltonian path visits every cell of the size×size grid
      exactly once, moving only between orthogonal neighbours. The
      boustrophedon (serpentine) walk is one by construction, and each
      backbite move (reverse a prefix ending at a grid-neighbour of the
      head) provably yields another Hamiltonian path.
   2. Cutting that path into k contiguous segments whose lengths sum to
      size² partitions the grid into k vertex-disjoint paths that
      together cover every cell.
   3. Each segment's two ends become that colour's dots, so tracing the
      segments themselves connects every pair, crosses nothing, and
      fills the board — a full-coverage solution always exists.
═══════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FlowEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ── DIFFICULTY TIERS ──
     size is the default board side; targetLen is the average path length
     the cutter aims for. Fewer, longer, windier flows = harder. */
  const LEVELS = {
    easy:   { size: 5,  targetLen: 5   },
    medium: { size: 7,  targetLen: 6.5 },
    hard:   { size: 9,  targetLen: 8   },
    expert: { size: 11, targetLen: 10  },
  };

  const SIZE_MIN = 5, SIZE_MAX = 14;
  const MIN_SEG = 3;     // shortest allowed flow (dot, middle, dot)
  const MAX_FLOWS = 16;  // size of the classic colour palette

  /* deterministic RNG (mulberry32) — used by the tests, available to
     callers that want reproducible boards */
  function makeRng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* How many flows a board gets. Clamped so every flow can be ≥ MIN_SEG
     cells (k ≤ area/3) and never exceeds the palette. */
  function flowCountFor(size, targetLen) {
    const area = size * size;
    const cap = Math.min(MAX_FLOWS, Math.floor(area / MIN_SEG));
    return Math.min(cap, Math.max(3, Math.round(area / targetLen)));
  }

  /* ── Hamiltonian path ──
     Start from the serpentine walk, then randomize with backbite moves:
     pick an end of the path, pick a grid-neighbour v of that end other
     than its path-successor, and reverse the path prefix up to (but not
     including) v. The result is again a Hamiltonian path. */
  function hamiltonianPath(size, rng, iterations) {
    const n = size * size;
    const path = new Array(n);
    const pos = new Array(n);   // pos[cell] = index of cell in path

    let i = 0;
    for (let r = 0; r < size; r++) {
      if (r % 2 === 0) for (let c = 0; c < size; c++) path[i++] = r * size + c;
      else for (let c = size - 1; c >= 0; c--) path[i++] = r * size + c;
    }
    for (let j = 0; j < n; j++) pos[path[j]] = j;

    const iters = iterations != null ? iterations : Math.max(300, 12 * n);
    for (let t = 0; t < iters; t++) {
      // operate on a random end by flipping the whole path half the time
      if (rng() < 0.5) {
        path.reverse();
        for (let j = 0; j < n; j++) pos[path[j]] = j;
      }
      const head = path[0];
      const r = Math.floor(head / size), c = head % size;
      const cand = [];
      if (r > 0)        cand.push(head - size);
      if (r < size - 1) cand.push(head + size);
      if (c > 0)        cand.push(head - 1);
      if (c < size - 1) cand.push(head + 1);
      const succ = path[1];
      const opts = cand.filter(v => v !== succ);
      if (!opts.length) continue;
      const v = opts[Math.floor(rng() * opts.length)];
      const k = pos[v];       // k ≥ 2: v is not the head and not its successor
      for (let a = 0, b = k - 1; a < b; a++, b--) {
        const tmp = path[a]; path[a] = path[b]; path[b] = tmp;
        pos[path[a]] = a; pos[path[b]] = b;
      }
    }
    return path;
  }

  /* Segment lengths: k×MIN_SEG plus the remaining area distributed
     uniformly at random. Always sums to exactly `area`. */
  function cutLengths(area, k, rng) {
    const lengths = new Array(k).fill(MIN_SEG);
    let extra = area - MIN_SEG * k;
    while (extra > 0) { lengths[Math.floor(rng() * k)]++; extra--; }
    return lengths;
  }

  function splitPath(path, lengths) {
    const segs = [];
    let at = 0;
    for (const len of lengths) { segs.push(path.slice(at, at + len)); at += len; }
    return segs;
  }

  function isStraight(seg, size) {
    const r0 = Math.floor(seg[0] / size), c0 = seg[0] % size;
    let sameRow = true, sameCol = true;
    for (const cell of seg) {
      if (Math.floor(cell / size) !== r0) sameRow = false;
      if (cell % size !== c0) sameCol = false;
    }
    return sameRow || sameCol;
  }

  /* Cosmetic quality score, lower is better: penalize flows whose dots
     sit on grid-adjacent cells (a 2-cell shortcut exists, which looks
     broken even though full coverage still forces the long route) and
     dead-straight flows (they read as filler). */
  function segmentScore(segs, size) {
    let bad = 0;
    for (const s of segs) {
      const a = s[0], b = s[s.length - 1];
      const dr = Math.abs(Math.floor(a / size) - Math.floor(b / size));
      const dc = Math.abs((a % size) - (b % size));
      if (dr + dc === 1) bad += 2;
      if (isStraight(s, size)) bad += 1;
    }
    return bad;
  }

  /* Generate a puzzle.
       opts.size        board side (SIZE_MIN..SIZE_MAX)
       opts.difficulty  'easy' | 'medium' | 'hard' | 'expert'
       opts.flows       optional explicit flow count (clamped to valid range)
       opts.rng         optional () => [0,1) for reproducible boards
     Returns { size, flows: [{ id, cells }] } where cells is the ordered
     solution path and cells[0] / cells[at end] are the dots. */
  function generate(opts) {
    const size = Math.max(SIZE_MIN, Math.min(SIZE_MAX, Math.round(opts.size)));
    const rng = opts.rng || Math.random;
    const level = LEVELS[opts.difficulty] || LEVELS.medium;
    const area = size * size;
    const cap = Math.min(MAX_FLOWS, Math.floor(area / MIN_SEG));
    const k = opts.flows != null
      ? Math.min(cap, Math.max(2, Math.round(opts.flows)))
      : flowCountFor(size, level.targetLen);

    let best = null, bestScore = Infinity;
    for (let attempt = 0; attempt < 6 && bestScore > 0; attempt++) {
      const path = hamiltonianPath(size, rng);
      for (let s = 0; s < 14 && bestScore > 0; s++) {
        const segs = splitPath(path, cutLengths(area, k, rng));
        const score = segmentScore(segs, size);
        if (score < bestScore) { bestScore = score; best = segs; }
      }
    }
    return { size, flows: best.map((cells, id) => ({ id, cells })) };
  }

  /* Structural validation — returns an array of error strings (empty =
     valid). Used by the test suite; cheap enough to run anywhere. */
  function validate(puzzle) {
    const errors = [];
    const { size, flows } = puzzle;
    const area = size * size;
    const seen = new Array(area).fill(-1);

    flows.forEach((f, fi) => {
      const cells = f.cells;
      if (cells.length < MIN_SEG) errors.push(`flow ${fi}: length ${cells.length} < ${MIN_SEG}`);
      if (cells[0] === cells[cells.length - 1]) errors.push(`flow ${fi}: dots coincide`);
      for (let j = 0; j < cells.length; j++) {
        const cell = cells[j];
        if (cell < 0 || cell >= area) { errors.push(`flow ${fi}: cell ${cell} out of range`); continue; }
        if (seen[cell] !== -1) errors.push(`flow ${fi}: cell ${cell} already used by flow ${seen[cell]}`);
        seen[cell] = fi;
        if (j > 0) {
          const prev = cells[j - 1];
          const diff = Math.abs(cell - prev);
          const sameRow = Math.floor(cell / size) === Math.floor(prev / size);
          if (!(diff === size || (diff === 1 && sameRow))) {
            errors.push(`flow ${fi}: cells ${prev}→${cell} not orthogonally adjacent`);
          }
        }
      }
    });
    for (let cell = 0; cell < area; cell++) {
      if (seen[cell] === -1) errors.push(`cell ${cell} not covered by any flow`);
    }
    return errors;
  }

  return {
    LEVELS, SIZE_MIN, SIZE_MAX, MIN_SEG, MAX_FLOWS,
    makeRng, flowCountFor, hamiltonianPath, cutLengths, splitPath,
    segmentScore, generate, validate,
  };
});
