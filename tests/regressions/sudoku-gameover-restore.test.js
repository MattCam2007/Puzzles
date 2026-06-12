// @vitest-environment jsdom
/* B4 — a restored game-over Sudoku must not be a dead board: the overlay
   re-shows so "Play Again" stays reachable. (Pre-refactor, restore kept
   gameOver=true but hid the overlay.) */
import { describe, it, expect, beforeAll } from 'vitest';
import { loadPage } from '../helpers/page.js';
import { readFixture } from '../helpers/fixtures.js';

describe('B4 — restoring a finished game re-shows the overlay', () => {
  beforeAll(async () => {
    localStorage.clear();
    const { puzzle, solved } = readFixture('sudoku-easy-seed11.json');
    // a lost game, as the pre-refactor code would have saved it
    localStorage.setItem(
      'sudoku-history',
      JSON.stringify([
        {
          ts: Date.now(),
          difficulty: 'easy',
          puzzle,
          solution: solved,
          playerBoard: puzzle,
          pencilMarks: Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => [])),
          seconds: 30,
          mistakes: 3,
          hintsUsed: 0,
          gameOver: true,
        },
      ]),
    );
    loadPage('sudoku.html');
    await import('../../js/pages/sudoku.js');
  });

  it('restores the board and shows the game-over overlay', () => {
    expect(document.querySelectorAll('#board .cell')).toHaveLength(81);
    expect(document.getElementById('overlay').classList.contains('show')).toBe(true);
    expect(document.getElementById('overlayTitle').textContent).toContain('Game Over');
  });

  it('Play Again starts a fresh game', () => {
    document.getElementById('overlayBtn').click();
    expect(document.getElementById('overlay').classList.contains('show')).toBe(false);
    const givens = document.querySelectorAll('#board .cell.given').length;
    expect(givens).toBeGreaterThan(0);
    expect(document.getElementById('timer').textContent).toBe('0:00');
  });
});
