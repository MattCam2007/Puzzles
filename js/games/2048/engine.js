/* 2048 rules engine — pure: no DOM, no storage, injectable randomness.
   Tiles are { val, id }; ids stay stable through slides and survive into the
   merged tile (the slide animation keys off this contract). */

import { defaultRandom } from '../../core/random.js';

export const N = 4;
export const WIN_MILESTONES = [2048, 4096];

export const mkGrid = () => Array.from({ length: N }, () => Array(N).fill(null));

export const deepClone = (g) => g.map((row) => row.map((cell) => (cell ? { ...cell } : null)));

/**
 * Slide/merge the grid in a direction (0=up, 1=right, 2=down, 3=left).
 * @returns {null | {newGrid, gained, moves}} null when nothing moves.
 *   moves[]: {id, fromR, fromC, toR, toC, absorbed, mergedVal} — `absorbed`
 *   tiles disappear into the merge destination; mergedVal=0 for plain slides.
 */
export function computeMove(grid, dir) {
  const lines = [];
  if (dir === 0)
    for (let c = 0; c < N; c++) {
      const l = [];
      for (let r = 0; r < N; r++) l.push([r, c]);
      lines.push(l);
    }
  else if (dir === 1)
    for (let r = 0; r < N; r++) {
      const l = [];
      for (let c = N - 1; c >= 0; c--) l.push([r, c]);
      lines.push(l);
    }
  else if (dir === 2)
    for (let c = 0; c < N; c++) {
      const l = [];
      for (let r = N - 1; r >= 0; r--) l.push([r, c]);
      lines.push(l);
    }
  else
    for (let r = 0; r < N; r++) {
      const l = [];
      for (let c = 0; c < N; c++) l.push([r, c]);
      lines.push(l);
    }

  const ng = deepClone(grid);
  const moves = [];
  let gained = 0;
  let anyMoved = false;

  for (const line of lines) {
    const tiles = line.map(([r, c]) => ({ ...ng[r][c], r, c })).filter((t) => t.val);
    for (const [r, c] of line) ng[r][c] = null;
    let wi = 0;
    let ti = 0;
    while (ti < tiles.length) {
      const [wr, wc] = line[wi];
      if (ti + 1 < tiles.length && tiles[ti].val === tiles[ti + 1].val) {
        const nv = tiles[ti].val * 2;
        ng[wr][wc] = { val: nv, id: tiles[ti].id };
        gained += nv;
        moves.push({
          id: tiles[ti].id,
          fromR: tiles[ti].r,
          fromC: tiles[ti].c,
          toR: wr,
          toC: wc,
          absorbed: false,
          mergedVal: nv,
        });
        moves.push({
          id: tiles[ti + 1].id,
          fromR: tiles[ti + 1].r,
          fromC: tiles[ti + 1].c,
          toR: wr,
          toC: wc,
          absorbed: true,
          mergedVal: nv,
        });
        if (tiles[ti].r !== wr || tiles[ti].c !== wc || tiles[ti + 1].r !== wr || tiles[ti + 1].c !== wc)
          anyMoved = true;
        wi++;
        ti += 2;
      } else {
        ng[wr][wc] = tiles[ti];
        moves.push({
          id: tiles[ti].id,
          fromR: tiles[ti].r,
          fromC: tiles[ti].c,
          toR: wr,
          toC: wc,
          absorbed: false,
          mergedVal: 0,
        });
        if (tiles[ti].r !== wr || tiles[ti].c !== wc) anyMoved = true;
        wi++;
        ti++;
      }
    }
  }
  return anyMoved ? { newGrid: ng, gained, moves } : null;
}

/**
 * Place a 2 (90%) or 4 (10%) in a random empty cell, mutating `g`.
 * @returns {[number, number] | null} the spawn position, or null when full.
 */
export function spawnTile(g, rand = defaultRandom, nextId = () => 0) {
  const empty = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (!g[r][c]) empty.push([r, c]);
  if (!empty.length) return null;
  const [r, c] = empty[Math.floor(rand() * empty.length)];
  g[r][c] = { val: rand() < 0.9 ? 2 : 4, id: nextId() };
  return [r, c];
}

export function hasMoves(g) {
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++) {
      if (!g[r][c]) return true;
      if (c < N - 1 && g[r][c].val === g[r][c + 1]?.val) return true;
      if (r < N - 1 && g[r][c].val === g[r + 1][c]?.val) return true;
    }
  return false;
}

export function highestTile(g) {
  let topVal = 0;
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++) if (g[r][c]?.val > topVal) topVal = g[r][c].val;
  return topVal;
}
