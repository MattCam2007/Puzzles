// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULTS,
  loadCfg,
  saveCfg,
  createGame,
  placeNumber,
  eraseCell,
  giveHint,
  clearPuzzle,
  clearAffectedPencilMarks,
  isWon,
  snapshot,
  fromSnapshot,
  persist,
  lastSnapshot,
} from '../../../js/games/sudoku/state.js';
import { seededRandom } from '../../../js/core/random.js';
import { readFixture } from '../../helpers/fixtures.js';

beforeEach(() => localStorage.clear());

const cfg = () => ({ ...DEFAULTS });

/** Game with a known puzzle/solution from the golden fixture. */
function fixtureGame() {
  const { puzzle, solved } = readFixture('sudoku-easy-seed11.json');
  return fromSnapshot({
    difficulty: 'easy',
    puzzle: puzzle.map((r) => [...r]),
    solution: solved.map((r) => [...r]),
    playerBoard: puzzle.map((r) => [...r]),
    pencilMarks: Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => [])),
    seconds: 0,
    mistakes: 0,
    hintsUsed: 0,
    gameOver: false,
  });
}

/** First empty cell + its solution value / a wrong value. */
function firstEmpty(game) {
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++)
      if (game.puzzle[r][c] === 0) {
        const right = game.solution[r][c];
        const wrong = (right % 9) + 1;
        return { r, c, right, wrong };
      }
  throw new Error('no empty cell');
}

describe('createGame', () => {
  it('builds a fresh game whose playerBoard mirrors the givens', () => {
    const game = createGame('medium', seededRandom(7));
    const fixture = readFixture('sudoku-medium-seed7.json');
    expect(game.puzzle).toEqual(fixture.puzzle);
    expect(game.solution).toEqual(fixture.solved);
    expect(game.playerBoard).toEqual(fixture.puzzle);
    expect(game.mistakes).toBe(0);
    expect(game.gameOver).toBe(false);
  });
});

describe('placeNumber', () => {
  it('ignores givens', () => {
    const game = fixtureGame();
    let given = null;
    outer: for (let r = 0; r < 9; r++)
      for (let c = 0; c < 9; c++)
        if (game.puzzle[r][c]) {
          given = [r, c];
          break outer;
        }
    expect(placeNumber(game, cfg(), given[0], given[1], 5)).toEqual({ type: 'noop' });
  });

  it('toggles off when re-placing the same number', () => {
    const game = fixtureGame();
    const { r, c, right } = firstEmpty(game);
    placeNumber(game, cfg(), r, c, right);
    expect(game.playerBoard[r][c]).toBe(right);
    const ev = placeNumber(game, cfg(), r, c, right);
    expect(ev).toEqual({ type: 'erase' });
    expect(game.playerBoard[r][c]).toBe(0);
  });

  it('pencil mode toggles marks and never marks filled cells', () => {
    const game = fixtureGame();
    const { r, c, right } = firstEmpty(game);
    game.pencilMode = true;
    expect(placeNumber(game, cfg(), r, c, 3)).toEqual({ type: 'pencil' });
    expect(game.pencilMarks[r][c].has(3)).toBe(true);
    placeNumber(game, cfg(), r, c, 3);
    expect(game.pencilMarks[r][c].has(3)).toBe(false);
    game.pencilMode = false;
    placeNumber(game, cfg(), r, c, right);
    game.pencilMode = true;
    expect(placeNumber(game, cfg(), r, c, 4)).toEqual({ type: 'noop' });
  });

  it('placing clears the cell own marks and (with the setting) row/col/box marks', () => {
    const game = fixtureGame();
    const { r, c, right } = firstEmpty(game);
    game.pencilMarks[r][c].add(right);
    game.pencilMarks[r][(c + 1) % 9].add(right); // same row
    game.pencilMarks[(r + 1) % 9][c].add(right); // same column
    placeNumber(game, cfg(), r, c, right);
    expect(game.pencilMarks[r][c].size).toBe(0);
    expect(game.pencilMarks[r][(c + 1) % 9].has(right)).toBe(false);
    expect(game.pencilMarks[(r + 1) % 9][c].has(right)).toBe(false);
  });

  it('keeps other cells marks when erasePencilMarks is off', () => {
    const game = fixtureGame();
    const { r, c, right } = firstEmpty(game);
    game.pencilMarks[r][(c + 1) % 9].add(right);
    placeNumber(game, { ...DEFAULTS, erasePencilMarks: false }, r, c, right);
    expect(game.pencilMarks[r][(c + 1) % 9].has(right)).toBe(true);
  });

  it('ends the game at exactly the strike limit', () => {
    const game = fixtureGame();
    const c3 = { ...DEFAULTS, strikeLimit: 3 };
    const cells = [];
    for (let r = 0; r < 9 && cells.length < 3; r++)
      for (let c = 0; c < 9 && cells.length < 3; c++)
        if (game.puzzle[r][c] === 0) cells.push([r, c]);
    const wrongAt = ([r, c]) => (game.solution[r][c] % 9) + 1;

    expect(placeNumber(game, c3, cells[0][0], cells[0][1], wrongAt(cells[0])).type).toBe('place');
    expect(placeNumber(game, c3, cells[1][0], cells[1][1], wrongAt(cells[1])).type).toBe('place');
    const ev = placeNumber(game, c3, cells[2][0], cells[2][1], wrongAt(cells[2]));
    expect(ev).toEqual({ type: 'lose' });
    expect(game.mistakes).toBe(3);
    expect(game.gameOver).toBe(true);
  });

  it('unlimited (0) never ends the game', () => {
    const game = fixtureGame();
    const c0 = { ...DEFAULTS, strikeLimit: 0 };
    const { r, c, right, wrong } = firstEmpty(game);
    for (let i = 0; i < 12; i++) {
      placeNumber(game, c0, r, c, wrong);
      placeNumber(game, c0, r, c, wrong); // toggle off
    }
    expect(game.gameOver).toBe(false);
    expect(placeNumber(game, c0, r, c, right).type).toBe('place');
  });

  it('mistakes are not counted when checkMistakes is off', () => {
    const game = fixtureGame();
    const { r, c, wrong } = firstEmpty(game);
    placeNumber(game, { ...DEFAULTS, checkMistakes: false }, r, c, wrong);
    expect(game.mistakes).toBe(0);
  });

  it('detects the win on the last correct cell', () => {
    const game = fixtureGame();
    game.playerBoard = game.solution.map((r) => [...r]);
    const { r, c, right } = firstEmpty(game);
    game.playerBoard[r][c] = 0;
    expect(isWon(game)).toBe(false);
    const ev = placeNumber(game, cfg(), r, c, right);
    expect(ev).toEqual({ type: 'place', won: true });
    expect(game.gameOver).toBe(true);
  });
});

describe('eraseCell', () => {
  it('clears value and marks of the selected non-given cell', () => {
    const game = fixtureGame();
    const { r, c, right } = firstEmpty(game);
    placeNumber(game, cfg(), r, c, right);
    game.selected = [r, c];
    expect(eraseCell(game)).toEqual({ type: 'erase' });
    expect(game.playerBoard[r][c]).toBe(0);
  });

  it('in pencil mode clears only the marks', () => {
    const game = fixtureGame();
    const { r, c } = firstEmpty(game);
    game.pencilMarks[r][c].add(1).add(2);
    game.selected = [r, c];
    game.pencilMode = true;
    eraseCell(game);
    expect(game.pencilMarks[r][c].size).toBe(0);
  });

  it('noops without a selection, on givens, or after game over', () => {
    const game = fixtureGame();
    expect(eraseCell(game)).toEqual({ type: 'noop' });
    game.gameOver = true;
    game.selected = [0, 0];
    expect(eraseCell(game)).toEqual({ type: 'noop' });
  });
});

describe('giveHint', () => {
  it('prefers the selected cell', () => {
    const game = fixtureGame();
    const { r, c, right } = firstEmpty(game);
    game.selected = [r, c];
    const ev = giveHint(game, cfg(), seededRandom(1));
    expect(ev.type).toBe('hint');
    expect(game.playerBoard[r][c]).toBe(right);
    expect(game.hintsUsed).toBe(1);
    expect(game.selected).toEqual([r, c]);
  });

  it('fills some wrong/empty cell when nothing is selected', () => {
    const game = fixtureGame();
    const ev = giveHint(game, cfg(), seededRandom(2));
    expect(ev.type).toBe('hint');
    const [r, c] = game.selected;
    expect(game.playerBoard[r][c]).toBe(game.solution[r][c]);
  });

  it('noops when hints are disabled or the game is over', () => {
    const game = fixtureGame();
    expect(giveHint(game, { ...DEFAULTS, showHints: false })).toEqual({ type: 'noop' });
    game.gameOver = true;
    expect(giveHint(game, cfg())).toEqual({ type: 'noop' });
  });

  it('wins the game when hinting the last cell', () => {
    const game = fixtureGame();
    game.playerBoard = game.solution.map((r) => [...r]);
    const { r, c } = firstEmpty(game);
    game.playerBoard[r][c] = 0;
    const ev = giveHint(game, cfg(), seededRandom(3));
    expect(ev).toEqual({ type: 'hint', won: true });
  });
});

describe('clearPuzzle', () => {
  it('resets entries, marks, mistakes and selection but keeps the puzzle', () => {
    const game = fixtureGame();
    const { r, c, right, wrong } = firstEmpty(game);
    placeNumber(game, cfg(), r, c, wrong);
    game.selected = [r, c];
    const ev = clearPuzzle(game);
    expect(ev).toEqual({ type: 'clear' });
    expect(game.playerBoard).toEqual(game.puzzle);
    expect(game.mistakes).toBe(0);
    expect(game.selected).toBe(null);
    expect(right).toBeGreaterThan(0);
  });

  it('noops after game over', () => {
    const game = fixtureGame();
    game.gameOver = true;
    expect(clearPuzzle(game)).toEqual({ type: 'noop' });
  });
});

describe('clearAffectedPencilMarks', () => {
  it('clears the row, column and box only', () => {
    const game = fixtureGame();
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) game.pencilMarks[r][c].add(5);
    clearAffectedPencilMarks(game, 4, 4, 5);
    expect(game.pencilMarks[4][8].has(5)).toBe(false); // row
    expect(game.pencilMarks[8][4].has(5)).toBe(false); // column
    expect(game.pencilMarks[3][3].has(5)).toBe(false); // box
    expect(game.pencilMarks[0][8].has(5)).toBe(true); // unrelated
  });
});

describe('persistence', () => {
  it('cfg round-trips through sudoku-cfg', () => {
    const c = { ...DEFAULTS, strikeLimit: 5, showCandidates: true };
    saveCfg(c);
    expect(loadCfg()).toEqual(c);
    expect(JSON.parse(localStorage.getItem('sudoku-cfg')).strikeLimit).toBe(5);
  });

  it('unknown stored cfg keys merge over defaults', () => {
    localStorage.setItem('sudoku-cfg', JSON.stringify({ strikeLimit: 10 }));
    const c = loadCfg();
    expect(c.strikeLimit).toBe(10);
    expect(c.highlight).toBe(DEFAULTS.highlight);
  });

  it('snapshot → fromSnapshot round-trips every field including Set pencil marks', () => {
    const game = fixtureGame();
    const { r, c } = firstEmpty(game);
    game.pencilMarks[r][c].add(2).add(7);
    game.seconds = 87;
    game.mistakes = 1;
    game.hintsUsed = 2;
    const restored = fromSnapshot(JSON.parse(JSON.stringify(snapshot(game))));
    expect(restored.playerBoard).toEqual(game.playerBoard);
    expect(restored.solution).toEqual(game.solution);
    expect([...restored.pencilMarks[r][c]]).toEqual([2, 7]);
    expect(restored.seconds).toBe(87);
    expect(restored.mistakes).toBe(1);
    expect(restored.hintsUsed).toBe(2);
    expect(restored.gameOver).toBe(false);
  });

  it('persist pushes into the sudoku-history ring; lastSnapshot reads it back', () => {
    const game = fixtureGame();
    persist(game);
    game.seconds = 10;
    persist(game);
    const ring = JSON.parse(localStorage.getItem('sudoku-history'));
    expect(ring).toHaveLength(2);
    expect(lastSnapshot().seconds).toBe(10);
  });

  it('restores a pre-refactor snapshot (compatibility contract)', () => {
    // shape captured from the pre-refactor saveGameState()
    const { puzzle, solved } = readFixture('sudoku-easy-seed11.json');
    const legacy = {
      ts: 1700000000000,
      difficulty: 'easy',
      puzzle,
      solution: solved,
      playerBoard: puzzle,
      pencilMarks: Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => [1, 9])),
      seconds: 42,
      mistakes: 2,
      hintsUsed: 1,
      gameOver: false,
    };
    localStorage.setItem('sudoku-history', JSON.stringify([legacy]));
    const game = fromSnapshot(lastSnapshot());
    expect(game.seconds).toBe(42);
    expect(game.pencilMarks[0][0].has(9)).toBe(true);
    expect(game.pencilMode).toBe(false);
  });

  it('lastSnapshot is null for empty or malformed history', () => {
    expect(lastSnapshot()).toBe(null);
    localStorage.setItem('sudoku-history', JSON.stringify([{ nope: true }]));
    expect(lastSnapshot()).toBe(null);
  });
});
