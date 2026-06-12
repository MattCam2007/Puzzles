/* Kakuro engine — generation + solver. Pure: no DOM, no storage.
   All randomness flows from the seed passed to generate(), via the same
   LCG the pre-refactor code used, so a given seed yields the same puzzle
   it always did. */

/** Linear-congruential PRNG — kept verbatim from the original engine:
    changing it would change every seeded board. */
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function popcount(x) {
  let n = 0;
  while (x) {
    x &= x - 1;
    n++;
  }
  return n;
}

/** Horizontal and vertical runs of white cells. */
export function segments(board, R, C) {
  const H = [];
  const V = [];
  for (let r = 0; r < R; r++) {
    let c = 0;
    while (c < C) {
      if (board[r][c]) {
        const cs = [];
        while (c < C && board[r][c]) {
          cs.push([r, c]);
          c++;
        }
        H.push(cs);
      } else c++;
    }
  }
  for (let c = 0; c < C; c++) {
    let r = 0;
    while (r < R) {
      if (board[r][c]) {
        const cs = [];
        while (r < R && board[r][c]) {
          cs.push([r, c]);
          r++;
        }
        V.push(cs);
      } else r++;
    }
  }
  return { H, V };
}

function layoutValid(board, R, C) {
  const { H, V } = segments(board, R, C);
  for (const s of [...H, ...V]) if (s.length < 2 || s.length > 9) return false;
  return true;
}

function genLayout(R, C, blackFrac, rand) {
  const interior = (R - 1) * (C - 1);
  const target = Math.round(interior * blackFrac);

  function blank() {
    const b = Array.from({ length: R }, () => Array(C).fill(false));
    for (let r = 1; r < R; r++) for (let c = 1; c < C; c++) b[r][c] = true;
    return b;
  }

  let board = blank();

  function canBlacken(r, c) {
    let cs = c;
    while (cs - 1 >= 1 && board[r][cs - 1]) cs--;
    let ce = c;
    while (ce + 1 < C && board[r][ce + 1]) ce++;
    const left = c - cs;
    const right = ce - c;
    if ((left > 0 && left < 2) || (right > 0 && right < 2)) return false;
    let rs = r;
    while (rs - 1 >= 1 && board[rs - 1][c]) rs--;
    let re = r;
    while (re + 1 < R && board[re + 1][c]) re++;
    const up = r - rs;
    const down = re - r;
    if ((up > 0 && up < 2) || (down > 0 && down < 2)) return false;
    return true;
  }

  // Break any run longer than 9 by blackening a legal cell inside it.
  function randomBreak() {
    let guard = 0;
    while (guard++ < interior * 4) {
      const { H, V } = segments(board, R, C);
      const longs = [...H, ...V].filter((s) => s.length > 9);
      if (!longs.length) return true;
      const long = longs[Math.floor(rand() * longs.length)];
      const len = long.length;
      const valid = [];
      for (let j = 0; j < len; j++) {
        const left = j;
        const right = len - 1 - j;
        if ((left > 0 && left < 2) || (right > 0 && right < 2) || left > 9 || right > 9) continue;
        valid.push(j);
      }
      for (let k = valid.length - 1; k > 0; k--) {
        const m = Math.floor(rand() * (k + 1));
        [valid[k], valid[m]] = [valid[m], valid[k]];
      }
      let done = false;
      for (const j of valid) {
        const [r, c] = long[j];
        if (canBlacken(r, c)) {
          board[r][c] = false;
          done = true;
          break;
        }
      }
      if (!done) return false;
    }
    return false;
  }

  // Fallback: recursively split the interior with black rows/columns.
  function crossSkeleton() {
    board = blank();
    function recurse(r0, r1, c0, c1) {
      const h = r1 - r0 + 1;
      const w = c1 - c0 + 1;
      if (h <= 9 && w <= 9) return;
      const splitRow = h > 9 && (w <= 9 || rand() < 0.5);
      if (splitRow) {
        const lo = r0 + 2;
        const hi = r1 - 2;
        const mr = Math.max(r0 + 2, Math.min(r1 - 2, lo + Math.floor(rand() * (hi - lo + 1))));
        for (let c = c0; c <= c1; c++) board[mr][c] = false;
        recurse(r0, mr - 1, c0, c1);
        recurse(mr + 1, r1, c0, c1);
      } else {
        const lo = c0 + 2;
        const hi = c1 - 2;
        const mc = Math.max(c0 + 2, Math.min(c1 - 2, lo + Math.floor(rand() * (hi - lo + 1))));
        for (let r = r0; r <= r1; r++) board[r][mc] = false;
        recurse(r0, r1, c0, mc - 1);
        recurse(r0, r1, mc + 1, c1);
      }
    }
    recurse(1, R - 1, 1, C - 1);
  }

  let ok = false;
  for (let t = 0; t < 10 && !ok; t++) {
    board = blank();
    ok = randomBreak();
  }
  if (!ok) crossSkeleton();

  let placed = 0;
  for (let r = 1; r < R; r++) for (let c = 1; c < C; c++) if (!board[r][c]) placed++;
  let attempts = 0;
  const cap = interior * 40;
  while (placed < target && attempts < cap) {
    attempts++;
    const r = 1 + Math.floor(rand() * (R - 1));
    const c = 1 + Math.floor(rand() * (C - 1));
    if (!board[r][c]) continue;
    if (canBlacken(r, c)) {
      board[r][c] = false;
      placed++;
    }
  }
  if (!layoutValid(board, R, C)) return null;
  return board;
}

function fillSolution(board, R, C, rand) {
  const { H, V } = segments(board, R, C);
  const cells = [];
  const idx = {};
  for (let r = 0; r < R; r++)
    for (let c = 0; c < C; c++)
      if (board[r][c]) {
        idx[r + ',' + c] = cells.length;
        cells.push([r, c]);
      }
  const constr = [...H, ...V].filter((s) => s.length >= 2);
  const segOf = cells.map(() => []);
  constr.forEach((s, si) => s.forEach(([r, c]) => segOf[idx[r + ',' + c]].push(si)));
  const used = constr.map(() => 0);
  const val = cells.map(() => 0);
  let steps = 0;
  const cap = 200000;

  function dom(i) {
    let d = 0b1111111110;
    for (const si of segOf[i]) d &= ~used[si];
    return d;
  }

  function bt() {
    if (++steps > cap) return false;
    let best = -1;
    let bestDomain = 0;
    let bestSize = 99;
    for (let i = 0; i < cells.length; i++) {
      if (val[i]) continue;
      const d = dom(i);
      const s = popcount(d);
      if (s === 0) return false;
      if (s < bestSize) {
        bestSize = s;
        best = i;
        bestDomain = d;
        if (s === 1) break;
      }
    }
    if (best === -1) return true;
    const ord = [];
    for (let d = 1; d <= 9; d++) if (bestDomain & (1 << d)) ord.push(d);
    for (let k = ord.length - 1; k > 0; k--) {
      const j = Math.floor(rand() * (k + 1));
      [ord[k], ord[j]] = [ord[j], ord[k]];
    }
    for (const d of ord) {
      const bit = 1 << d;
      val[best] = d;
      for (const si of segOf[best]) used[si] |= bit;
      if (bt()) return true;
      val[best] = 0;
      for (const si of segOf[best]) used[si] &= ~bit;
      if (steps > cap) return false;
    }
    return false;
  }

  if (!bt()) return null;
  const sol = Array.from({ length: R }, () => Array(C).fill(0));
  cells.forEach(([r, c], i) => (sol[r][c] = val[i]));
  return sol;
}

function deriveClues(board, sol, R, C) {
  const clues = Array.from({ length: R }, () => Array(C).fill(null));
  const { H, V } = segments(board, R, C);
  for (const s of H) {
    if (s.length < 2) continue;
    const [r, c0] = s[0];
    const sum = s.reduce((a, [rr, cc]) => a + sol[rr][cc], 0);
    if (!clues[r][c0 - 1]) clues[r][c0 - 1] = {};
    clues[r][c0 - 1].right = sum;
  }
  for (const s of V) {
    if (s.length < 2) continue;
    const [r0, c] = s[0];
    const sum = s.reduce((a, [rr, cc]) => a + sol[rr][cc], 0);
    if (!clues[r0 - 1][c]) clues[r0 - 1][c] = {};
    clues[r0 - 1][c].down = sum;
  }
  return clues;
}

const comboCache = {};

/** All sets of `len` distinct digits summing to `sum`, as bitmasks (bit d = digit d). */
export function combos(len, sum) {
  const key = len + '_' + sum;
  if (comboCache[key]) return comboCache[key];
  const res = [];
  (function rec(start, length, remaining, mask) {
    if (length === 0) {
      if (remaining === 0) res.push(mask);
      return;
    }
    for (let d = start; d <= 9; d++) {
      if (d > remaining) break;
      rec(d + 1, length - 1, remaining - d, mask | (1 << d));
    }
  })(1, len, sum, 0);
  comboCache[key] = res;
  return res;
}

const comboCountCache = {};

export function comboCount(len, sum) {
  const key = len + '_' + sum;
  if (comboCountCache[key] !== undefined) return comboCountCache[key];
  const n = combos(len, sum).length;
  comboCountCache[key] = n;
  return n;
}

/** Simulated annealing: nudge the solution towards run sums with few combos. */
export function tightenCombos(board, R, C, rand, sol, iters, timeBudgetMs) {
  const { H, V } = segments(board, R, C);
  const idx = {};
  const cells = [];
  for (let r = 0; r < R; r++)
    for (let c = 0; c < C; c++)
      if (board[r][c]) {
        idx[r + ',' + c] = cells.length;
        cells.push([r, c]);
      }
  const runs = [];
  const runOf = cells.map(() => []);
  for (const s of [...H, ...V]) {
    if (s.length < 2) continue;
    const ri = runs.length;
    const cl = s.map(([r, c]) => idx[r + ',' + c]);
    runs.push({ cells: cl, len: s.length });
    for (const ci of cl) runOf[ci].push(ri);
  }
  const val = cells.map(([r, c]) => sol[r][c]);
  const sum = runs.map((rn) => {
    let t = 0;
    for (const ci of rn.cells) t += val[ci];
    return t;
  });
  const cc = runs.map((rn, ri) => comboCount(rn.len, sum[ri]));
  let score = cc.reduce((a, b) => a + b, 0);
  let best = val.slice();
  let bestScore = score;
  let T = Math.max(2, runs.length * 0.15);
  const t0 = Date.now();
  for (let it = 0; it < iters && Date.now() - t0 < timeBudgetMs; it++) {
    const i = Math.floor(rand() * cells.length);
    const myRuns = runOf[i];
    if (!myRuns.length) continue;
    let used = 0;
    for (const ri of myRuns) for (const ci of runs[ri].cells) if (ci !== i) used |= 1 << val[ci];
    const old = val[i];
    const opts = [];
    for (let d = 1; d <= 9; d++) if (d !== old && !(used & (1 << d))) opts.push(d);
    if (!opts.length) continue;
    const d = opts[Math.floor(rand() * opts.length)];
    let delta = 0;
    const newCC = {};
    for (const ri of myRuns) {
      const ns = sum[ri] - old + d;
      const ncc = comboCount(runs[ri].len, ns);
      newCC[ri] = [ns, ncc];
      delta += ncc - cc[ri];
    }
    if (delta <= 0 || rand() < Math.exp(-delta / T)) {
      val[i] = d;
      for (const ri of myRuns) {
        sum[ri] = newCC[ri][0];
        cc[ri] = newCC[ri][1];
      }
      score += delta;
      if (score < bestScore) {
        bestScore = score;
        best = val.slice();
      }
    }
    T *= 0.9995;
    if (T < 0.05) T = 0.05;
  }
  const grid = Array.from({ length: R }, () => Array(C).fill(0));
  cells.forEach(([r, c], i) => (grid[r][c] = best[i]));
  return { sol: grid, score: bestScore };
}

function buildSegs(board, clues, R, C) {
  const cells = [];
  const idx = {};
  for (let r = 0; r < R; r++)
    for (let c = 0; c < C; c++)
      if (board[r][c]) {
        idx[r + ',' + c] = cells.length;
        cells.push([r, c]);
      }
  const { H, V } = segments(board, R, C);
  const segs = [];
  for (const s of H) {
    if (s.length < 2) continue;
    const [r0, c0] = s[0];
    segs.push({ cells: s.map(([r, c]) => idx[r + ',' + c]), target: clues[r0][c0 - 1].right });
  }
  for (const s of V) {
    if (s.length < 2) continue;
    const [r0, c0] = s[0];
    segs.push({ cells: s.map(([r, c]) => idx[r + ',' + c]), target: clues[r0 - 1][c0].down });
  }
  const segOf = cells.map(() => []);
  segs.forEach((s, si) => s.cells.forEach((ci) => segOf[ci].push(si)));
  segs.forEach((s) => {
    let m = 0;
    for (const cm of combos(s.cells.length, s.target)) m |= cm;
    s.allowed = m;
  });
  return { cells, idx, segs, segOf };
}

/** Count solutions (up to `limit`), optionally with fixed entries per cell index. */
export function solve(board, clues, R, C, limit = 2, fixed = null) {
  const { cells, segs, segOf } = buildSegs(board, clues, R, C);
  const val = cells.map(() => 0);
  const usedMask = segs.map(() => 0);
  const remSum = segs.map((s) => s.target);
  const remCnt = segs.map((s) => s.cells.length);
  if (fixed) {
    for (let i = 0; i < cells.length; i++) {
      const d = fixed[i];
      if (d) {
        for (const si of segOf[i]) {
          if (usedMask[si] & (1 << d)) return { count: 0, solution: null, cells };
          usedMask[si] |= 1 << d;
          remSum[si] -= d;
          remCnt[si]--;
        }
        val[i] = d;
      }
    }
  }
  let count = 0;
  let firstSol = null;

  function dom(ci) {
    let d = 0b1111111110;
    for (const si of segOf[ci]) d &= segs[si].allowed & ~usedMask[si];
    return d;
  }

  function bt() {
    if (count >= limit) return;
    let best = -1;
    let bestDomain = 0;
    let bestSize = 99;
    for (let i = 0; i < cells.length; i++) {
      if (val[i]) continue;
      const d = dom(i);
      const s = popcount(d);
      if (s === 0) return;
      if (s < bestSize) {
        bestSize = s;
        best = i;
        bestDomain = d;
        if (s === 1) break;
      }
    }
    if (best === -1) {
      for (let si = 0; si < segs.length; si++) if (remSum[si] !== 0) return;
      count++;
      if (!firstSol) firstSol = val.slice();
      return;
    }
    for (let d = 1; d <= 9; d++) {
      if (!(bestDomain & (1 << d))) continue;
      let ok = true;
      for (const si of segOf[best]) {
        const nrem = remSum[si] - d;
        const ncnt = remCnt[si] - 1;
        if (ncnt === 0) {
          if (nrem !== 0) {
            ok = false;
            break;
          }
          continue;
        }
        // Bounds check: smallest/largest sums reachable with the digits left.
        const avail = ~(usedMask[si] | (1 << d));
        let mn = 0;
        let mx = 0;
        let g = 0;
        for (let x = 1; x <= 9 && g < ncnt; x++)
          if (avail & (1 << x)) {
            mn += x;
            g++;
          }
        g = 0;
        for (let x = 9; x >= 1 && g < ncnt; x--)
          if (avail & (1 << x)) {
            mx += x;
            g++;
          }
        if (nrem < mn || nrem > mx) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      val[best] = d;
      for (const si of segOf[best]) {
        usedMask[si] |= 1 << d;
        remSum[si] -= d;
        remCnt[si]--;
      }
      bt();
      val[best] = 0;
      for (const si of segOf[best]) {
        usedMask[si] &= ~(1 << d);
        remSum[si] += d;
        remCnt[si]++;
      }
      if (count >= limit) return;
    }
  }

  bt();
  let grid = null;
  if (firstSol) {
    grid = Array.from({ length: R }, () => Array(C).fill(0));
    cells.forEach(([r, c], i) => (grid[r][c] = firstSol[i]));
  }
  return { count, solution: grid, cells };
}

/** Flag duplicate digits in runs and broken/over-sum runs. */
export function evaluate(board, clues, R, C, entries) {
  const { H, V } = segments(board, R, C);
  const err = Array.from({ length: R }, () => Array(C).fill(false));
  let filled = 0;
  let white = 0;
  let allRunsOk = true;
  for (let r = 0; r < R; r++)
    for (let c = 0; c < C; c++)
      if (board[r][c]) {
        white++;
        if (entries[r][c]) filled++;
      }

  function checkRun(s, clue) {
    const vals = s.map(([r, c]) => entries[r][c]);
    const seen = {};
    let sum = 0;
    let full = true;
    for (let i = 0; i < s.length; i++) {
      const v = vals[i];
      if (!v) {
        full = false;
        continue;
      }
      sum += v;
      if (seen[v] !== undefined) {
        allRunsOk = false;
        const [r, c] = s[i];
        err[r][c] = true;
        const j = seen[v];
        const [rr, cc] = s[j];
        err[rr][cc] = true;
      }
      seen[v] = i;
    }
    if (full) {
      if (sum !== clue) {
        allRunsOk = false;
        for (const [r, c] of s) err[r][c] = true;
      }
    } else {
      allRunsOk = false;
      if (sum >= clue) {
        for (const [r, c] of s) if (entries[r][c]) err[r][c] = true;
      }
    }
  }

  for (const s of H) {
    if (s.length < 2) continue;
    const [r0, c0] = s[0];
    checkRun(s, clues[r0][c0 - 1].right);
  }
  for (const s of V) {
    if (s.length < 2) continue;
    const [r0, c0] = s[0];
    checkRun(s, clues[r0 - 1][c0].down);
  }
  return { err, complete: filled === white && allRunsOk, filled, white };
}

/** One logically-guaranteed placement, preferring `target` when provided. */
export function hint(board, clues, R, C, entries, target) {
  const { cells } = buildSegs(board, clues, R, C);
  const fixed = cells.map(([r, c]) => entries[r][c] || 0);
  const res = solve(board, clues, R, C, 1, fixed);
  if (res.count === 0) return { conflict: true };
  if (target) {
    const { r, c } = target;
    if (board[r][c]) return { r, c, val: res.solution[r][c] };
  }
  for (const [r, c] of cells) {
    if (!entries[r][c]) return { r, c, val: res.solution[r][c] };
  }
  return null;
}

/** Per-cell candidate digits given run combos and already-used digits. */
export function candidates(board, clues, R, C, entries) {
  const { H, V } = segments(board, R, C);
  const hRun = {};
  const vRun = {};
  for (const s of H) {
    if (s.length < 2) continue;
    const [r0, c0] = s[0];
    const t = clues[r0][c0 - 1].right;
    let allow = 0;
    for (const cm of combos(s.length, t)) allow |= cm;
    let used = 0;
    for (const [r, c] of s) if (entries[r][c]) used |= 1 << entries[r][c];
    for (const [r, c] of s) hRun[r + ',' + c] = { allow, used };
  }
  for (const s of V) {
    if (s.length < 2) continue;
    const [r0, c0] = s[0];
    const t = clues[r0 - 1][c0].down;
    let allow = 0;
    for (const cm of combos(s.length, t)) allow |= cm;
    let used = 0;
    for (const [r, c] of s) if (entries[r][c]) used |= 1 << entries[r][c];
    for (const [r, c] of s) vRun[r + ',' + c] = { allow, used };
  }
  const out = {};
  for (let r = 0; r < R; r++)
    for (let c = 0; c < C; c++)
      if (board[r][c] && !entries[r][c]) {
        let d = 0b1111111110;
        const h = hRun[r + ',' + c];
        const v = vRun[r + ',' + c];
        if (h) d &= h.allow & ~h.used;
        if (v) d &= v.allow & ~v.used;
        const list = [];
        for (let x = 1; x <= 9; x++) if (d & (1 << x)) list.push(x);
        out[r + ',' + c] = list;
      }
  return out;
}

export function generate(level, size, seed) {
  const bdMap = { easy: 0.34, medium: 0.26, hard: 0.16 };
  const bd = bdMap[level] !== undefined ? bdMap[level] : 0.26;
  const S = Math.max(5, Math.min(12, size || 5));
  const R = S + 1;
  const C = S + 1;
  const rand = rng(seed);
  let board = null;
  let sol = null;
  for (let a = 0; a < 80 && !sol; a++) {
    board = genLayout(R, C, bd, rand);
    if (!board) continue;
    sol = fillSolution(board, R, C, rand);
  }
  if (!sol) {
    for (let a = 0; a < 400 && !sol; a++) {
      board = genLayout(R, C, Math.max(bd, 0.2), rand);
      if (!board) continue;
      sol = fillSolution(board, R, C, rand);
    }
  }
  if (!board || !sol) {
    board = genLayout(R, C, 0.4, rand) || genLayout(R, C, 0.4, rng((seed ^ 0x9e3779b9) >>> 0));
    sol = board ? fillSolution(board, R, C, rand) : null;
  }
  if (board && sol) {
    const interior = (R - 1) * (C - 1);
    sol = tightenCombos(board, R, C, rand, sol, interior * 500, 150).sol;
  }
  const clues = deriveClues(board, sol, R, C);
  return { R, C, board, clues, solution: sol, level, seed };
}
