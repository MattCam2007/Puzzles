import { describe, it, expect } from 'vitest';
import {
  N,
  WIN_MILESTONES,
  mkGrid,
  deepClone,
  computeMove,
  spawnTile,
  hasMoves,
  highestTile,
} from '../../../js/games/2048/engine.js';
import { seededRandom } from '../../../js/core/random.js';
import { readFixture } from '../../helpers/fixtures.js';

const UP = 0;
const RIGHT = 1;
const DOWN = 2;
const LEFT = 3;

let autoId = 0;
/** Build a grid from a 4×4 matrix of values (0 = empty). */
function grid(vals) {
  const g = mkGrid();
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++) if (vals[r][c]) g[r][c] = { val: vals[r][c], id: ++autoId };
  return g;
}
/** One populated row, rest empty. */
const row = (...vals) => grid([vals, [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
const vals = (cells) => cells.map((c) => (c ? c.val : null));

describe('computeMove — merge rules', () => {
  it('merges equal neighbours once per move: [2,2,2,2] → [4,4], gained 8', () => {
    const res = computeMove(row(2, 2, 2, 2), LEFT);
    expect(vals(res.newGrid[0])).toEqual([4, 4, null, null]);
    expect(res.gained).toBe(8);
  });

  it('does not chain-merge: [4,2,2,_] → [4,4,_,_] not [8,…]', () => {
    const res = computeMove(row(4, 2, 2, 0), LEFT);
    expect(vals(res.newGrid[0])).toEqual([4, 4, null, null]);
    expect(res.gained).toBe(4);
  });

  it('merges the near pair first moving left: [2,2,2,_] → [4,2,_,_]', () => {
    const res = computeMove(row(2, 2, 2, 0), LEFT);
    expect(vals(res.newGrid[0])).toEqual([4, 2, null, null]);
  });

  it('merges the far pair first moving right: [2,2,2,_] → [_,_,2,4]', () => {
    const res = computeMove(row(2, 2, 2, 0), RIGHT);
    expect(vals(res.newGrid[0])).toEqual([null, null, 2, 4]);
  });

  it('slides across gaps without merging different values', () => {
    const res = computeMove(row(2, 0, 0, 4), LEFT);
    expect(vals(res.newGrid[0])).toEqual([2, 4, null, null]);
    expect(res.gained).toBe(0);
  });

  it('works vertically: column [2,2,4,4] → [4,8] moving up', () => {
    const g = grid([
      [2, 0, 0, 0],
      [2, 0, 0, 0],
      [4, 0, 0, 0],
      [4, 0, 0, 0],
    ]);
    const res = computeMove(g, UP);
    expect(vals(res.newGrid.map((r) => r[0]))).toEqual([4, 8, null, null]);
    expect(res.gained).toBe(12);
  });

  it('moving down stacks at the bottom', () => {
    const g = grid([
      [2, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [2, 0, 0, 0],
    ]);
    const res = computeMove(g, DOWN);
    expect(vals(res.newGrid.map((r) => r[0]))).toEqual([null, null, null, 4]);
  });

  it('returns null when no tile can move', () => {
    expect(computeMove(row(2, 4, 8, 16), LEFT)).toBe(null);
    const full = grid([
      [2, 4, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
      [4, 2, 4, 2],
    ]);
    for (const dir of [UP, RIGHT, DOWN, LEFT]) expect(computeMove(full, dir)).toBe(null);
  });

  it('does not mutate the input grid', () => {
    const g = row(2, 2, 0, 0);
    const before = JSON.stringify(g);
    computeMove(g, LEFT);
    expect(JSON.stringify(g)).toBe(before);
  });
});

describe('computeMove — animation contract (moves[] and tile ids)', () => {
  it('keeps tile ids stable through slides', () => {
    const g = row(2, 0, 0, 4);
    const idA = g[0][0].id;
    const idB = g[0][3].id;
    const res = computeMove(g, LEFT);
    expect(res.newGrid[0][0].id).toBe(idA);
    expect(res.newGrid[0][1].id).toBe(idB);
    expect(res.moves).toEqual([
      { id: idA, fromR: 0, fromC: 0, toR: 0, toC: 0, absorbed: false, mergedVal: 0 },
      { id: idB, fromR: 0, fromC: 3, toR: 0, toC: 1, absorbed: false, mergedVal: 0 },
    ]);
  });

  it('a merge keeps the first tile id and marks the second absorbed', () => {
    const g = row(2, 2, 0, 0);
    const idA = g[0][0].id;
    const idB = g[0][1].id;
    const res = computeMove(g, LEFT);
    expect(res.newGrid[0][0]).toEqual({ val: 4, id: idA });
    expect(res.moves).toEqual([
      { id: idA, fromR: 0, fromC: 0, toR: 0, toC: 0, absorbed: false, mergedVal: 4 },
      { id: idB, fromR: 0, fromC: 1, toR: 0, toC: 0, absorbed: true, mergedVal: 4 },
    ]);
  });
});

describe('spawnTile', () => {
  it('fills a random empty cell with 2 (90%) or 4 (10%)', () => {
    const rand = seededRandom(1);
    const g = mkGrid();
    let uid = 0;
    const pos = spawnTile(g, rand, () => ++uid);
    expect(pos).not.toBe(null);
    const [r, c] = pos;
    expect([2, 4]).toContain(g[r][c].val);
    expect(g[r][c].id).toBe(1);
  });

  it('returns null on a full grid', () => {
    const full = grid([
      [2, 4, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
      [4, 2, 4, 2],
    ]);
    expect(spawnTile(full, seededRandom(1), () => 99)).toBe(null);
  });

  it('spawns ~10% fours over many trials', () => {
    const rand = seededRandom(123);
    let fours = 0;
    const trials = 2000;
    for (let i = 0; i < trials; i++) {
      const g = mkGrid();
      const [r, c] = spawnTile(g, rand, () => 1);
      if (g[r][c].val === 4) fours++;
    }
    expect(fours / trials).toBeGreaterThan(0.07);
    expect(fours / trials).toBeLessThan(0.13);
  });
});

describe('hasMoves', () => {
  it('true with any empty cell', () => {
    expect(hasMoves(row(2, 4, 8, 16))).toBe(true);
  });
  it('true on a full grid with one adjacent equal pair', () => {
    const g = grid([
      [2, 4, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 4, 8],
      [4, 2, 8, 2],
    ]);
    expect(hasMoves(g)).toBe(true);
  });
  it('false on a checkerboard', () => {
    const g = grid([
      [2, 4, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
      [4, 2, 4, 2],
    ]);
    expect(hasMoves(g)).toBe(false);
  });
});

describe('highestTile', () => {
  it('returns the max value, 0 when empty', () => {
    expect(highestTile(mkGrid())).toBe(0);
    expect(
      highestTile(
        grid([
          [2, 0, 0, 0],
          [0, 1024, 0, 0],
          [0, 0, 16, 0],
          [0, 0, 0, 0],
        ]),
      ),
    ).toBe(1024);
  });
});

describe('milestones', () => {
  it('are 2048 then 4096', () => {
    expect(WIN_MILESTONES).toEqual([2048, 4096]);
  });
});

describe('golden master — scripted seeded game', () => {
  it('replays the recorded move sequence exactly', () => {
    const fixture = readFixture('2048-seed99-moves.json');
    const rand = seededRandom(fixture.seed);
    let uid = 0;
    const nextId = () => ++uid;
    let g = mkGrid();
    spawnTile(g, rand, nextId);
    spawnTile(g, rand, nextId);
    let score = 0;
    const trace = [];
    for (const dir of fixture.dirs) {
      const res = computeMove(g, dir);
      if (!res) {
        trace.push({ dir, moved: false });
        continue;
      }
      score += res.gained;
      g = res.newGrid;
      const spawn = spawnTile(g, rand, nextId);
      trace.push({ dir, moved: true, gained: res.gained, spawn });
    }
    expect(trace).toEqual(fixture.trace);
    expect(score).toBe(fixture.finalScore);
    expect(g).toEqual(fixture.finalGrid);
  });

  it('deepClone produces an independent copy', () => {
    const g = row(2, 4, 0, 0);
    const copy = deepClone(g);
    copy[0][0].val = 999;
    expect(g[0][0].val).toBe(2);
  });
});
