/* Sudoku rules engine — pure: no DOM, no storage, injectable randomness. */

import { shuffle, defaultRandom } from '../../core/random.js';

export const CLUES = { easy: 45, medium: 36, hard: 28, expert: 22 };

/** Row/col/box scan shared by isValid and isLegalPlacement. */
function hasConflict(valueAt, row, col, num, skipSelf) {
  for (let c = 0; c < 9; c++) {
    if (skipSelf && c === col) continue;
    if (valueAt(row, c) === num) return true;
  }
  for (let r = 0; r < 9; r++) {
    if (skipSelf && r === row) continue;
    if (valueAt(r, col) === num) return true;
  }
  const br = Math.floor(row / 3) * 3;
  const bc = Math.floor(col / 3) * 3;
  for (let r = br; r < br + 3; r++) {
    for (let c = bc; c < bc + 3; c++) {
      if (skipSelf && r === row && c === col) continue;
      if (valueAt(r, c) === num) return true;
    }
  }
  return false;
}

/** Can `num` go at (row, col) on a single board (cell assumed empty)? */
export function isValid(board, row, col, num) {
  return !hasConflict((r, c) => board[r][c], row, col, num, false);
}

/** Live-board legality (givens + player entries), ignoring the cell itself. */
export function isLegalPlacement(puzzle, playerBoard, row, col, num) {
  return !hasConflict((r, c) => puzzle[r][c] || playerBoard[r][c], row, col, num, true);
}

export function findEmpty(board) {
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if (!board[r][c]) return [r, c];
  return null;
}

function fillBoard(board, rand) {
  const empty = findEmpty(board);
  if (!empty) return true;
  const [r, c] = empty;
  for (const n of shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], rand)) {
    if (isValid(board, r, c, n)) {
      board[r][c] = n;
      if (fillBoard(board, rand)) return true;
      board[r][c] = 0;
    }
  }
  return false;
}

export function generateSolved(rand = defaultRandom) {
  const board = Array.from({ length: 9 }, () => Array(9).fill(0));
  fillBoard(board, rand);
  return board;
}

export function countSolutions(board, limit = 2) {
  const clone = board.map((r) => [...r]);
  let count = 0;
  function solve() {
    if (count >= limit) return;
    const empty = findEmpty(clone);
    if (!empty) {
      count++;
      return;
    }
    const [r, c] = empty;
    for (let n = 1; n <= 9; n++) {
      if (isValid(clone, r, c, n)) {
        clone[r][c] = n;
        solve();
        clone[r][c] = 0;
      }
    }
  }
  solve();
  return count;
}

/** @returns {{puzzle: number[][], solved: number[][]}} unique-solution puzzle */
export function makePuzzle(difficulty, rand = defaultRandom) {
  const solved = generateSolved(rand);
  const puzzle = solved.map((r) => [...r]);
  const cells = shuffle([...Array(81).keys()], rand);
  const target = CLUES[difficulty] || 36;
  let removed = 0;
  for (const idx of cells) {
    if (81 - removed <= target) break;
    const r = Math.floor(idx / 9);
    const c = idx % 9;
    const val = puzzle[r][c];
    puzzle[r][c] = 0;
    if (countSolutions(puzzle) !== 1) puzzle[r][c] = val;
    else removed++;
  }
  return { puzzle, solved };
}
