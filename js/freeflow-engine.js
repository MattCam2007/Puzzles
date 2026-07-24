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
     generation aims for.

     These targets are measured, not chosen. A board only stays uniquely
     solvable down to a certain flow count — push past it and the puzzle
     stops being forced — and that floor is a property of the board size:
     roughly 5 flows on 5×5, 8 on 7×7, 11 on 9×9, 13 on 10×10. Aiming at
     the floor means generation stops when it arrives rather than paying
     to discover the wall, and the counts land where the original game's
     boards sit anyway. Difficulty is therefore mostly board size, which
     is exactly how the real game scales.

     Expert is 10×10 rather than 11×11 deliberately: 11×11 cannot be made
     uniquely solvable below about 15–18 flows, and that many colours
     reads as visual noise rather than as difficulty. Bigger boards are
     still available from the size picker. */
  const LEVELS = {
    easy:   { size: 5,  targetLen: 5.0 },
    medium: { size: 7,  targetLen: 6.1 },
    hard:   { size: 9,  targetLen: 7.4 },
    expert: { size: 10, targetLen: 7.7 },
  };

  /* 11 is the largest board that reliably comes out forced inside a New
     Game click. 12×12 can get there but needs several seconds of merging,
     and 13×13 / 14×14 need 23–26 flows before they are forced at all —
     more colours than a player can tell apart. Capping here is what lets
     the generator promise that every board it returns has exactly one
     solution. */
  const SIZE_MIN = 5, SIZE_MAX = 11;
  const MIN_SEG = 3;     // shortest allowed flow (dot, middle, dot)
  const MAX_FLOWS = 20;  // size of the colour palette

  /* Per-solve search cap used during generation. Enough to settle any
     board tight enough to be worth keeping; anything needing more is
     declined rather than waited on. */
  const NODE_BUDGET = 120000;

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

  /* ── MERGE-DOWN GENERATION ──
     Cutting a Hamiltonian path into k pieces gives a board that is
     *solvable* but not *forced*: a 9×9 cut that way typically admits
     hundreds of board-filling solutions, so nothing is ever deduced and
     the board can be wiggled into place a dozen different ways. Real
     Flow boards have exactly one solution — that is what makes a move
     feel earned. So generation runs backwards from a heavily
     over-segmented board instead:

       1. cut the Hamiltonian path into the shortest legal flows, which
          leaves a board so constrained it is almost always unique
       2. repeatedly merge two flows whose endpoints touch, keeping the
          merge only while the board still has exactly one solution
       3. stop at the difficulty's target flow count, or earlier if no
          further merge can preserve uniqueness

     Every uniqueness check therefore runs on an already-tight board,
     where the solver settles in well under a millisecond — proving
     uniqueness on a *loose* board is the expensive direction, and this
     order never has to do it. Merging also consumes exactly the
     touching-endpoint pairs that made cut boards look wrong, so the
     dots end up spread instead of clustered in kissing pairs. */

  /* Fisher-Yates against the engine's own rng — common.js's shuffle()
     always uses Math.random, which would break seeded reproducibility. */
  function shuffleWith(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function neighborCells(cell, size) {
    const r = Math.floor(cell / size), c = cell % size, out = [];
    if (r > 0) out.push(cell - size);
    if (r < size - 1) out.push(cell + size);
    if (c > 0) out.push(cell - 1);
    if (c < size - 1) out.push(cell + 1);
    return out;
  }

  /* Join two flows whose endpoints touch, trying all four orientations.
     Returns the merged cell list, or null if no ends are adjacent. */
  function joinFlows(a, b, size) {
    for (const ra of [false, true]) {
      const A = ra ? a.slice().reverse() : a;
      for (const rb of [false, true]) {
        const B = rb ? b.slice().reverse() : b;
        const tail = A[A.length - 1], headB = B[0];
        const diff = Math.abs(tail - headB);
        const sameRow = Math.floor(tail / size) === Math.floor(headB / size);
        if (diff === size || (diff === 1 && sameRow)) return A.concat(B);
      }
    }
    return null;
  }

  /* All unordered flow pairs whose endpoints are grid-adjacent. */
  function mergeablePairs(flows, size) {
    const endOwner = new Map();
    flows.forEach((cells, i) => {
      endOwner.set(cells[0], i);
      endOwner.set(cells[cells.length - 1], i);
    });
    const seen = new Set(), pairs = [];
    flows.forEach((cells, i) => {
      for (const end of [cells[0], cells[cells.length - 1]]) {
        for (const nb of neighborCells(end, size)) {
          const j = endOwner.get(nb);
          if (j === undefined || j === i) continue;
          const key = i < j ? i + ':' + j : j + ':' + i;
          if (seen.has(key)) continue;
          seen.add(key);
          pairs.push([Math.min(i, j), Math.max(i, j)]);
        }
      }
    });
    return pairs;
  }

  function dotsOfCells(flowCells) {
    return flowCells.map(c => [c[0], c[c.length - 1]]);
  }

  /* Generate a puzzle.
       opts.size        board side (SIZE_MIN..SIZE_MAX)
       opts.difficulty  'easy' | 'medium' | 'hard' | 'expert'
       opts.flows       optional explicit flow-count target
       opts.rng         optional () => [0,1) for reproducible boards
       opts.unique      set false to skip the uniqueness work (fast path
                        used by the structural tests)
       opts.budgetMs    wall-clock cap on the merge loop
     Returns { size, flows: [{ id, cells }], unique, targetFlows } where
     cells is the ordered solution path and its two ends are the dots. */
  function generate(opts) {
    const size = Math.max(SIZE_MIN, Math.min(SIZE_MAX, Math.round(opts.size)));
    const rng = opts.rng || Math.random;
    const level = LEVELS[opts.difficulty] || LEVELS.medium;
    const area = size * size;
    const cap = Math.min(MAX_FLOWS, Math.floor(area / MIN_SEG));
    const target = opts.flows != null
      ? Math.min(cap, Math.max(2, Math.round(opts.flows)))
      : flowCountFor(size, level.targetLen);
    /* Wall-clock cap on merging. Uniqueness is an invariant here — the
       board starts forced and only proven-forced merges are accepted —
       so running out of time costs a few extra colours, never a mushier
       puzzle. That makes a tight budget safe, and keeps New Game from
       stalling on the biggest boards. Small boards reach their target
       long before the ceiling matters; it only binds on 10×10 and up. */
    const budgetMs = opts.budgetMs != null ? opts.budgetMs
      : Math.min(1200, Math.max(300, area * 6));
    const wantUnique = opts.unique !== false;
    const started = Date.now();

    if (!wantUnique) {
      let best = null, bestScore = Infinity;
      for (let attempt = 0; attempt < 6 && bestScore > 0; attempt++) {
        const path = hamiltonianPath(size, rng);
        for (let s = 0; s < 14 && bestScore > 0; s++) {
          const segs = splitPath(path, cutLengths(area, target, rng));
          const score = segmentScore(segs, size);
          if (score < bestScore) { bestScore = score; best = segs; }
        }
      }
      return { size, flows: best.map((cells, id) => ({ id, cells })),
               unique: false, targetFlows: target };
    }

    // 1. over-segment: the shortest legal flows the area allows. A board
    //    this tight is essentially always forced, and verifying it costs
    //    a couple of milliseconds even at 11×11 — but not always, so take
    //    a fresh path if the first cut happens to be loose.
    const k0 = Math.floor(area / MIN_SEG);
    let cells = null, unique = false;
    for (let attempt = 0; attempt < 4 && !unique; attempt++) {
      cells = splitPath(hamiltonianPath(size, rng), cutLengths(area, k0, rng));
      unique = countSolutions(size, dotsOfCells(cells), 2, NODE_BUDGET) === 1;
      if (Date.now() - started > budgetMs) break;
    }

    // 2. merge while the board stays forced. Candidates are tried
    //    shortest-first: merging two stubby flows loosens the board least,
    //    so the accepted merge tends to come early and we pay for fewer of
    //    the expensive rejections.
    /* Apply several independent merges at once and verify them with a
       single solve. Early on — going from ~40 flows down to ~20 — merges
       essentially never break uniqueness, so checking them one at a time
       is almost all wasted work. On failure the batch halves; only once
       it is down to a single pair does a rejection mean anything, and
       only when every remaining pair is rejected individually has the
       board genuinely run out of room. */
    function applyMerges(list, selected) {
      const out = [], drop = new Set();
      for (const [i, j] of selected) { drop.add(i); drop.add(j); }
      list.forEach((c, x) => { if (!drop.has(x)) out.push(c); });
      for (const [i, j] of selected) out.push(joinFlows(list[i], list[j], size));
      return out;
    }

    function candidates() {
      return shuffleWith(mergeablePairs(cells, size), rng)
        .filter(([i, j]) => joinFlows(cells[i], cells[j], size))
        .sort((p, q) => (cells[p[0]].length + cells[p[1]].length) -
                        (cells[q[0]].length + cells[q[1]].length));
    }

    let batch = Math.max(1, Math.floor((cells.length - target) / 3));
    while (unique && cells.length > target) {
      if (Date.now() - started > budgetMs) break;
      const pairs = candidates();
      if (!pairs.length) break;

      if (batch > 1) {
        const selected = [], used = new Set();
        const room = cells.length - target;
        for (const [i, j] of pairs) {
          if (selected.length >= Math.min(batch, room)) break;
          if (used.has(i) || used.has(j)) continue;
          used.add(i); used.add(j);
          selected.push([i, j]);
        }
        if (!selected.length) { batch = 1; continue; }
        const next = applyMerges(cells, selected);
        if (countSolutions(size, dotsOfCells(next), 2, NODE_BUDGET) === 1) cells = next;
        else batch = Math.floor(batch / 2) || 1;
        continue;
      }

      let merged = false;
      for (const [i, j] of pairs) {
        if (Date.now() - started > budgetMs) break;
        const next = applyMerges(cells, [[i, j]]);
        // -1 means the solver ran out of budget: unknown, so decline
        if (countSolutions(size, dotsOfCells(next), 2, NODE_BUDGET) === 1) {
          cells = next;
          merged = true;
          break;
        }
      }
      if (!merged) break;   // no merge left that keeps the board forced
    }

    // If even the over-segmented cut came out loose, fall back to plain
    // merging so the board is at least the right shape.
    while (!unique && cells.length > target) {
      const pairs = mergeablePairs(cells, size);
      if (!pairs.length) break;
      const [i, j] = pairs[Math.floor(rng() * pairs.length)];
      const joined = joinFlows(cells[i], cells[j], size);
      if (!joined) break;
      cells = cells.filter((_, x) => x !== i && x !== j);
      cells.push(joined);
    }

    // 3. the palette is finite. Only if uniqueness held out above it do we
    //    force merges down — rare, and only on the largest custom sizes.
    while (cells.length > cap) {
      const pairs = mergeablePairs(cells, size);
      if (!pairs.length) break;
      const [i, j] = pairs[Math.floor(rng() * pairs.length)];
      const joined = joinFlows(cells[i], cells[j], size);
      if (!joined) break;
      cells = cells.filter((_, x) => x !== i && x !== j);
      cells.push(joined);
      unique = false;
    }

    return { size, flows: cells.map((c, id) => ({ id, cells: c })),
             unique, targetFlows: target };
  }

  /* ── SOLVER ──
     Counts board-filling solutions (Flow's actual rule: connect every
     pair AND cover every cell), stopping at `limit`. Exact — used both
     to grade candidate boards during generation and by the tests.

     Search: each colour grows one cell at a time from its first dot
     toward its second. At every node the colour with the fewest free
     neighbours is the one extended — a deterministic function of the
     board state, so each distinct solution is still enumerated exactly
     once, but forced moves get played before speculative ones and the
     tree collapses. Three prunes do the rest, all derived from one
     observation: an unfinished colour can only reach free cells by
     growing from its head, and can only leave free space by stepping
     onto its own goal dot.
       1. a free cell with fewer than two usable neighbours can never be
          both entered and left
       2. an unfinished colour's head and goal must sit on a common
          region of free cells (or already touch)
       3. every free region must have some unfinished colour with both
          head and goal touching it — otherwise nothing can fill it */
  function buildNeighbors(size) {
    const n = size * size;
    const start = new Int32Array(n + 1);
    const list = [];
    for (let cell = 0; cell < n; cell++) {
      start[cell] = list.length;
      const r = Math.floor(cell / size), c = cell % size;
      if (r > 0) list.push(cell - size);
      if (r < size - 1) list.push(cell + size);
      if (c > 0) list.push(cell - 1);
      if (c < size - 1) list.push(cell + 1);
    }
    start[n] = list.length;
    return { start, list: Int32Array.from(list) };
  }

  /* Returns the number of board-filling solutions, capped at `limit`.
     With `maxNodes` set, returns -1 instead if the search could not be
     settled within that many nodes — callers must treat -1 as "unknown",
     never as a pass. This keeps generation from ever hanging: proving
     uniqueness on a loose board is the one genuinely expensive case, and
     a bounded search lets the generator decline it rather than stall. */
  function countSolutions(size, dots, limit, maxNodes) {
    if (limit === undefined) limit = 2;
    if (maxNodes === undefined) maxNodes = Infinity;
    const n = size * size, k = dots.length;
    const { start, list } = buildNeighbors(size);

    const owner  = new Int8Array(n).fill(-1);
    const headOf = new Int32Array(n).fill(-1);
    const goalOf = new Int32Array(n).fill(-1);
    const head   = new Int32Array(k);
    const goal   = new Int32Array(k);

    /* Deterministic colour order: most-constrained endpoints first
       (corners before edges before interior). Ties break on cell index
       so the ordering — and therefore the enumeration — is stable. */
    const deg = cell => start[cell + 1] - start[cell];
    const order = dots.map((d, i) => i).sort((x, y) => {
      const dx = deg(dots[x][0]) + deg(dots[x][1]);
      const dy = deg(dots[y][0]) + deg(dots[y][1]);
      return dx - dy || dots[x][0] - dots[y][0];
    });

    for (let c = 0; c < k; c++) {
      const [a, b] = dots[order[c]];
      if (a === b) return 0;
      if (owner[a] !== -1 || owner[b] !== -1) return 0;  // dots collide
      owner[a] = c; owner[b] = c;
      head[c] = a; goal[c] = b;
      headOf[a] = c; goalOf[b] = c;
    }

    let free = n - 2 * k;
    let count = 0;

    const compId    = new Int32Array(n);
    const compStamp = new Int32Array(n).fill(-1);
    const stack     = new Int32Array(n);
    const servable  = new Uint8Array(n);
    const hComp     = new Int32Array(4);
    const gComp     = new Int32Array(4);
    let stamp = 0;

    const done = new Uint8Array(k);
    let doneCount = 0;

    /* live connector: a dot (or growing head) still available to a colour
       that has not yet joined up */
    function isLive(cell) {
      const h = headOf[cell], g = goalOf[cell];
      return (h >= 0 && !done[h] && h === owner[cell]) ||
             (g >= 0 && !done[g] && g === owner[cell]);
    }

    function prune() {
      stamp++;
      let ncomp = 0;

      for (let cell = 0; cell < n; cell++) {
        if (owner[cell] !== -1 || compStamp[cell] === stamp) continue;
        const id = ncomp++;
        servable[id] = 0;
        let top = 0;
        stack[top++] = cell;
        compStamp[cell] = stamp;
        compId[cell] = id;
        while (top > 0) {
          const x = stack[--top];
          let usable = 0;
          for (let e = start[x]; e < start[x + 1]; e++) {
            const y = list[e];
            if (owner[y] === -1) {
              usable++;
              if (compStamp[y] !== stamp) {
                compStamp[y] = stamp; compId[y] = id;
                stack[top++] = y;
              }
            } else if (isLive(y)) {
              usable++;
            }
          }
          if (usable < 2) return false;   // cell can be entered but never left
        }
      }

      for (let c2 = 0; c2 < k; c2++) {
        if (done[c2]) continue;
        const h = head[c2], g = goal[c2];
        let touches = false;
        let hn = 0, gn = 0;
        for (let e = start[h]; e < start[h + 1]; e++) {
          const y = list[e];
          if (y === g) { touches = true; }
          else if (owner[y] === -1) {
            const id = compId[y];
            let seen = false;
            for (let i = 0; i < hn; i++) if (hComp[i] === id) { seen = true; break; }
            if (!seen) hComp[hn++] = id;
          }
        }
        for (let e = start[g]; e < start[g + 1]; e++) {
          const y = list[e];
          if (owner[y] === -1) {
            const id = compId[y];
            let seen = false;
            for (let i = 0; i < gn; i++) if (gComp[i] === id) { seen = true; break; }
            if (!seen) gComp[gn++] = id;
          }
        }
        let shared = false;
        for (let i = 0; i < hn; i++) {
          for (let j = 0; j < gn; j++) {
            if (hComp[i] === gComp[j]) { servable[hComp[i]] = 1; shared = true; }
          }
        }
        if (!shared && !touches) return false;  // colour is walled off from its goal
      }

      for (let id = 0; id < ncomp; id++) if (!servable[id]) return false;
      return true;
    }

    let nodes = 0, exhausted = false;

    function extend() {
      if (count >= limit || exhausted) return;
      if (++nodes > maxNodes) { exhausted = true; return; }
      if (doneCount === k) { if (free === 0) count++; return; }
      if (!prune()) return;

      /* most-constrained unfinished colour; ties break on the fixed
         `order` ranking so the enumeration stays deterministic */
      let c = -1, bestDeg = 1e9;
      for (let x = 0; x < k; x++) {
        if (done[x]) continue;
        const h = head[x];
        let d = 0;
        for (let e = start[h]; e < start[h + 1]; e++) if (owner[list[e]] === -1) d++;
        if (d < bestDeg) { bestDeg = d; c = x; }
      }

      const h = head[c], g = goal[c];
      for (let e = start[h]; e < start[h + 1]; e++) {
        if (list[e] === g) {            // close this colour off
          done[c] = 1; doneCount++;
          extend();
          done[c] = 0; doneCount--;
          if (count >= limit || exhausted) return;
          break;
        }
      }
      for (let e = start[h]; e < start[h + 1]; e++) {
        const nb = list[e];
        if (owner[nb] !== -1) continue;
        owner[nb] = c; head[c] = nb; headOf[h] = -1; headOf[nb] = c; free--;
        extend();
        owner[nb] = -1; head[c] = h; headOf[nb] = -1; headOf[h] = c; free++;
        if (count >= limit || exhausted) return;
      }
    }

    extend();
    // hitting the cap is only indeterminate if we had not already reached
    // the answer the caller asked for
    if (exhausted && count < limit) return -1;
    return count;
  }

  function dotsOf(flows) {
    return flows.map(f => [f.cells[0], f.cells[f.cells.length - 1]]);
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
    segmentScore, generate, validate, countSolutions, dotsOf,
    mergeablePairs, joinFlows, shuffleWith,
  };
});
