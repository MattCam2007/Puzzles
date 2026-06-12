import { describe, it, expect } from 'vitest';
import {
  makePuzzle,
  generateSolved,
  countSolutions,
  isValid,
  isLegalPlacement,
  findEmpty,
  CLUES,
} from '../../../js/games/sudoku/engine.js';
import { seededRandom } from '../../../js/core/random.js';
import { readFixture } from '../../helpers/fixtures.js';

const isPermutation = (nine) => [...nine].sort((a, b) => a - b).join('') === '123456789';

function isSolvedBoard(b) {
  for (let i = 0; i < 9; i++) {
    if (!isPermutation(b[i])) return false;
    if (!isPermutation(b.map((row) => row[i]))) return false;
  }
  for (let br = 0; br < 9; br += 3)
    for (let bc = 0; bc < 9; bc += 3) {
      const box = [];
      for (let r = br; r < br + 3; r++) for (let c = bc; c < bc + 3; c++) box.push(b[r][c]);
      if (!isPermutation(box)) return false;
    }
  return true;
}

describe('generateSolved', () => {
  it('produces a fully valid solved board', () => {
    expect(isSolvedBoard(generateSolved(seededRandom(1)))).toBe(true);
  });
});

describe('makePuzzle', () => {
  for (const diff of ['easy', 'medium', 'hard', 'expert']) {
    it(`${diff}: unique solution, clue count ≥ target, givens match solution`, () => {
      const { puzzle, solved } = makePuzzle(diff, seededRandom(42));
      expect(isSolvedBoard(solved)).toBe(true);
      expect(countSolutions(puzzle)).toBe(1);
      const clues = puzzle.flat().filter(Boolean).length;
      expect(clues).toBeGreaterThanOrEqual(CLUES[diff]);
      puzzle.forEach((row, r) =>
        row.forEach((v, c) => {
          if (v) expect(v).toBe(solved[r][c]);
        }),
      );
    });
  }

  it('harder difficulties remove more clues (golden fixtures)', () => {
    const count = (f) => readFixture(f).puzzle.flat().filter(Boolean).length;
    expect(count('sudoku-easy-seed11.json')).toBeGreaterThan(
      count('sudoku-expert-seed3.json'),
    );
  });

  it('unknown difficulty falls back to the medium clue target', () => {
    const { puzzle } = makePuzzle('nonsense', seededRandom(8));
    expect(puzzle.flat().filter(Boolean).length).toBeGreaterThanOrEqual(CLUES.medium);
  });

  it('is deterministic for a fixed seed (golden master)', () => {
    expect(makePuzzle('medium', seededRandom(7))).toEqual(readFixture('sudoku-medium-seed7.json'));
    expect(makePuzzle('easy', seededRandom(11))).toEqual(readFixture('sudoku-easy-seed11.json'));
    expect(makePuzzle('expert', seededRandom(3))).toEqual(readFixture('sudoku-expert-seed3.json'));
  });
});

describe('isValid', () => {
  const empty = Array.from({ length: 9 }, () => Array(9).fill(0));

  it('rejects row, column and box conflicts', () => {
    const b = empty.map((r) => [...r]);
    b[4][4] = 5;
    expect(isValid(b, 4, 0, 5)).toBe(false); // same row
    expect(isValid(b, 0, 4, 5)).toBe(false); // same column
    expect(isValid(b, 3, 3, 5)).toBe(false); // same box
    expect(isValid(b, 0, 0, 5)).toBe(true); // unrelated
    expect(isValid(b, 4, 0, 6)).toBe(true); // different number
  });
});

describe('isLegalPlacement', () => {
  const zeros = () => Array.from({ length: 9 }, () => Array(9).fill(0));

  it('sees both givens and player entries', () => {
    const puzzle = zeros();
    const player = zeros();
    puzzle[0][0] = 7; // given
    player[8][1] = 7; // player entry, same box-column region? row 8 col 1
    expect(isLegalPlacement(puzzle, player, 0, 5, 7)).toBe(false); // row conflict w/ given
    expect(isLegalPlacement(puzzle, player, 5, 1, 7)).toBe(false); // col conflict w/ player
    expect(isLegalPlacement(puzzle, player, 4, 4, 7)).toBe(true);
  });

  it('ignores the target cell itself', () => {
    const puzzle = zeros();
    const player = zeros();
    player[2][2] = 3;
    expect(isLegalPlacement(puzzle, player, 2, 2, 3)).toBe(true);
  });

  it('agrees with isValid on empty cells of a bare board', () => {
    const { puzzle } = makePuzzle('easy', seededRandom(13));
    const player = zeros();
    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 9; c++) {
        if (puzzle[r][c]) continue;
        for (let n = 1; n <= 9; n++) {
          expect(isLegalPlacement(puzzle, player, r, c, n)).toBe(isValid(puzzle, r, c, n));
        }
      }
  });
});

describe('countSolutions', () => {
  it('returns 0 for an unsolvable board', () => {
    const b = Array.from({ length: 9 }, () => Array(9).fill(0));
    // Make cell (0,0) impossible: 1-8 in its row, 9 in its column.
    for (let c = 1; c <= 8; c++) b[0][c] = c;
    b[1][0] = 9;
    expect(countSolutions(b)).toBe(0);
  });

  it('caps at the limit (empty board has many solutions)', () => {
    const b = Array.from({ length: 9 }, () => Array(9).fill(0));
    expect(countSolutions(b, 2)).toBe(2);
    expect(countSolutions(b, 5)).toBe(5);
  });

  it('returns 1 for a solved board', () => {
    const solved = generateSolved(seededRandom(2));
    expect(countSolutions(solved)).toBe(1);
  });
});

describe('findEmpty', () => {
  it('returns the first empty cell in reading order, or null', () => {
    const solved = generateSolved(seededRandom(4));
    expect(findEmpty(solved)).toBe(null);
    solved[3][5] = 0;
    expect(findEmpty(solved)).toEqual([3, 5]);
  });
});
