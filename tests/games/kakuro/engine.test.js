import { describe, it, expect } from 'vitest';
import {
  rng,
  segments,
  combos,
  comboCount,
  solve,
  evaluate,
  hint,
  candidates,
  generate,
} from '../../../js/games/kakuro/engine.js';
import { readFixture } from '../../helpers/fixtures.js';

const digitsOf = (mask) => {
  const out = [];
  for (let d = 1; d <= 9; d++) if (mask & (1 << d)) out.push(d);
  return out;
};

describe('rng', () => {
  it('is deterministic and in [0,1)', () => {
    const a = rng(123);
    const b = rng(123);
    for (let i = 0; i < 50; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('combos', () => {
  it('2 cells summing 4 → only {1,3}', () => {
    expect(combos(2, 4).map(digitsOf)).toEqual([[1, 3]]);
  });
  it('classic: 4 cells summing 10 → only {1,2,3,4}', () => {
    expect(comboCount(4, 10)).toBe(1);
    expect(digitsOf(combos(4, 10)[0])).toEqual([1, 2, 3, 4]);
  });
  it('2 cells summing 17 → only {8,9}', () => {
    expect(combos(2, 17).map(digitsOf)).toEqual([[8, 9]]);
  });
  it('hand-computed table: 2 cells, sums 3..10', () => {
    // counts: 3→1, 4→1, 5→2, 6→2, 7→3, 8→3, 9→4, 10→4
    expect([3, 4, 5, 6, 7, 8, 9, 10].map((s) => comboCount(2, s))).toEqual([
      1, 1, 2, 2, 3, 3, 4, 4,
    ]);
  });
  it('3 cells summing 7 → {1,2,4} only', () => {
    expect(combos(3, 7).map(digitsOf)).toEqual([[1, 2, 4]]);
  });
  it('impossible sums are empty', () => {
    expect(combos(2, 3 + 9 * 9)).toEqual([]);
    expect(combos(2, 2)).toEqual([]);
    expect(combos(9, 46)).toEqual([]);
  });
  it('9 cells summing 45 → exactly all digits', () => {
    expect(combos(9, 45).map(digitsOf)).toEqual([[1, 2, 3, 4, 5, 6, 7, 8, 9]]);
  });
});

describe('segments', () => {
  it('finds horizontal and vertical runs of white cells', () => {
    // . X X
    // . X .
    const board = [
      [false, true, true],
      [false, true, false],
    ];
    const { H, V } = segments(board, 2, 3);
    expect(H).toEqual([
      [
        [0, 1],
        [0, 2],
      ],
      [[1, 1]],
    ]);
    expect(V).toEqual([
      [
        [0, 1],
        [1, 1],
      ],
      [[0, 2]],
    ]);
  });
});

describe('generate + solve round trip', () => {
  it.each([
    ['easy', 5],
    ['medium', 7],
    ['hard', 9],
  ])('%s %i×%i: solvable, and the shipped solution satisfies every clue', (level, size) => {
    const g = generate(level, size, 1234);
    expect(g.R).toBe(size + 1);
    expect(g.C).toBe(size + 1);
    expect(solve(g.board, g.clues, g.R, g.C, 2).count).toBeGreaterThanOrEqual(1);
    expect(evaluate(g.board, g.clues, g.R, g.C, g.solution).complete).toBe(true);
  });

  it('clamps size to [5, 12]', () => {
    expect(generate('easy', 1, 5).R).toBe(6);
    expect(generate('easy', 99, 5).R).toBe(13);
  });

  it('matches the golden masters captured from the pre-refactor engine', () => {
    expect(generate('easy', 5, 1234)).toEqual(readFixture('kakuro-easy-5-seed1234.json'));
    expect(generate('medium', 7, 1234)).toEqual(readFixture('kakuro-medium-7-seed1234.json'));
    expect(generate('hard', 9, 1234)).toEqual(readFixture('kakuro-hard-9-seed1234.json'));
  });
});

/* Small fixture board used by evaluate/hint/candidates tests:
   one across run of 2 cells (sum 4 → {1,3}) crossing nothing else.
     [clue][white][white]
*/
function tinyBoard() {
  const board = [[false, true, true]];
  const clues = [[{ right: 4 }, null, null]];
  return { board, clues, R: 1, C: 3 };
}

describe('evaluate', () => {
  it('flags duplicate digits in a run', () => {
    const { board, clues, R, C } = tinyBoard();
    const entries = [[0, 2, 2]];
    const res = evaluate(board, clues, R, C, entries);
    expect(res.err[0][1]).toBe(true);
    expect(res.err[0][2]).toBe(true);
    expect(res.complete).toBe(false);
  });

  it('flags a completed run with the wrong sum', () => {
    const { board, clues, R, C } = tinyBoard();
    const res = evaluate(board, clues, R, C, [[0, 1, 2]]); // 3 ≠ 4
    expect(res.err[0][1]).toBe(true);
    expect(res.err[0][2]).toBe(true);
  });

  it('flags over-sum partial runs', () => {
    const { board, clues, R, C } = tinyBoard();
    const res = evaluate(board, clues, R, C, [[0, 5, 0]]); // 5 ≥ 4 with a cell left
    expect(res.err[0][1]).toBe(true);
    expect(res.complete).toBe(false);
  });

  it('accepts a correct complete fill', () => {
    const { board, clues, R, C } = tinyBoard();
    const res = evaluate(board, clues, R, C, [[0, 1, 3]]);
    expect(res.complete).toBe(true);
    expect(res.err.flat().every((e) => !e)).toBe(true);
    expect(res.filled).toBe(2);
    expect(res.white).toBe(2);
  });
});

describe('hint', () => {
  it('returns conflict:true when entries contradict all solutions', () => {
    const { board, clues, R, C } = tinyBoard();
    expect(hint(board, clues, R, C, [[0, 9, 0]], null)).toEqual({ conflict: true });
  });

  it('respects a target cell when provided', () => {
    const g = generate('easy', 5, 1234);
    const entries = Array.from({ length: g.R }, () => Array(g.C).fill(0));
    let target = null;
    outer: for (let r = 0; r < g.R; r++)
      for (let c = 0; c < g.C; c++)
        if (g.board[r][c]) {
          target = { r, c };
          break outer;
        }
    const res = hint(g.board, g.clues, g.R, g.C, entries, target);
    expect(res.r).toBe(target.r);
    expect(res.c).toBe(target.c);
    expect(res.val).toBe(g.solution[target.r][target.c]);
  });

  it('fills the first empty cell when no target given', () => {
    const { board, clues, R, C } = tinyBoard();
    const res = hint(board, clues, R, C, [[0, 0, 0]], null);
    expect(res).toEqual({ r: 0, c: 1, val: expect.any(Number) });
    expect([1, 3]).toContain(res.val);
  });

  it('returns null when the grid is already full', () => {
    const { board, clues, R, C } = tinyBoard();
    expect(hint(board, clues, R, C, [[0, 1, 3]], null)).toBe(null);
  });
});

describe('candidates', () => {
  it('restricts digits to the run combos minus used digits', () => {
    const { board, clues, R, C } = tinyBoard();
    // sum 4 over 2 cells → {1,3}; nothing placed yet
    expect(candidates(board, clues, R, C, [[0, 0, 0]])).toEqual({
      '0,1': [1, 3],
      '0,2': [1, 3],
    });
    // place a 1 → the other cell can only be 3
    expect(candidates(board, clues, R, C, [[0, 1, 0]])['0,2']).toEqual([3]);
  });

  it('intersects across and down constraints on a generated board', () => {
    const g = generate('medium', 7, 1234);
    const entries = Array.from({ length: g.R }, () => Array(g.C).fill(0));
    const cmap = candidates(g.board, g.clues, g.R, g.C, entries);
    for (let r = 0; r < g.R; r++)
      for (let c = 0; c < g.C; c++)
        if (g.board[r][c]) {
          // the true solution digit is always among the candidates
          expect(cmap[r + ',' + c]).toContain(g.solution[r][c]);
        }
  });
});

describe('solve', () => {
  it('honours fixed entries and detects contradictions', () => {
    const { board, clues, R, C } = tinyBoard();
    // cells in reading order: [0,1], [0,2]
    expect(solve(board, clues, R, C, 2, [1, 0]).count).toBe(1);
    expect(solve(board, clues, R, C, 2, [2, 0]).count).toBe(0);
    expect(solve(board, clues, R, C, 2, [2, 2]).count).toBe(0); // duplicate in run
  });

  it('returns the first solution as a grid', () => {
    const { board, clues, R, C } = tinyBoard();
    const res = solve(board, clues, R, C, 2);
    expect(res.count).toBe(2); // {1,3} and {3,1}
    expect(res.solution[0][1] + res.solution[0][2]).toBe(4);
  });
});
