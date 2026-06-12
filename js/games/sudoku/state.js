/* Sudoku game state — pure: mutates the state container and reports what
   changed as events; rendering and persistence policy live in main.js. */

import { STORAGE_KEYS, loadJSON, saveJSON, pushHistory } from '../../core/storage.js';
import { defaultRandom } from '../../core/random.js';
import { makePuzzle } from './engine.js';

export const DEFAULTS = {
  inputMode: 'number', // 'cell' | 'number'
  highlight: true,
  sameNum: true,
  highlightPencil: true,
  erasePencilMarks: true,
  showHints: true,
  showCandidates: false,
  showExcluded: false,
  checkMistakes: true,
  showMistakeDots: true,
  strikeLimit: 3, // 0 = unlimited
  useKeyboard: true,
  showNumpad: true,
};

export function loadCfg() {
  return Object.assign({}, DEFAULTS, loadJSON(STORAGE_KEYS.sudokuCfg, {}));
}

export function saveCfg(cfg) {
  saveJSON(STORAGE_KEYS.sudokuCfg, cfg);
}

const emptyMarks = () =>
  Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => new Set()));

export function createGame(difficulty, rand = defaultRandom) {
  const { puzzle, solved } = makePuzzle(difficulty, rand);
  return {
    difficulty,
    puzzle,
    solution: solved,
    playerBoard: puzzle.map((r) => [...r]),
    pencilMarks: emptyMarks(),
    selected: null, // [r, c] for cell-first
    selectedNum: null, // number for number-first
    pencilMode: false,
    mistakes: 0,
    seconds: 0,
    hintsUsed: 0,
    gameOver: false,
  };
}

export function isWon(game) {
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++) if (game.playerBoard[r][c] !== game.solution[r][c]) return false;
  return true;
}

export function clearAffectedPencilMarks(game, row, col, num) {
  const br = Math.floor(row / 3) * 3;
  const bc = Math.floor(col / 3) * 3;
  for (let i = 0; i < 9; i++) {
    game.pencilMarks[row][i].delete(num);
    game.pencilMarks[i][col].delete(num);
  }
  for (let r = br; r < br + 3; r++)
    for (let c = bc; c < bc + 3; c++) game.pencilMarks[r][c].delete(num);
}

/**
 * Place/pencil/toggle number `n` at (r, c).
 * @returns {{type: 'noop'|'pencil'|'erase'|'lose'|'place', won?: boolean}}
 */
export function placeNumber(game, cfg, r, c, n) {
  if (game.puzzle[r][c] !== 0) return { type: 'noop' }; // given

  if (game.pencilMode) {
    if (game.playerBoard[r][c] !== 0) return { type: 'noop' };
    const marks = game.pencilMarks[r][c];
    if (marks.has(n)) marks.delete(n);
    else marks.add(n);
    return { type: 'pencil' };
  }

  if (game.playerBoard[r][c] === n) {
    // toggle off if same
    game.playerBoard[r][c] = 0;
    return { type: 'erase' };
  }

  game.playerBoard[r][c] = n;
  game.pencilMarks[r][c].clear();
  if (cfg.erasePencilMarks) clearAffectedPencilMarks(game, r, c, n);

  if (cfg.checkMistakes && n !== game.solution[r][c]) {
    game.mistakes++;
    if (cfg.strikeLimit > 0 && game.mistakes >= cfg.strikeLimit) {
      game.gameOver = true;
      return { type: 'lose' };
    }
  }
  const won = isWon(game);
  if (won) game.gameOver = true;
  return { type: 'place', won };
}

/** Erase the selected cell (value + marks; marks only in pencil mode). */
export function eraseCell(game) {
  if (game.gameOver || !game.selected) return { type: 'noop' };
  const [r, c] = game.selected;
  if (game.puzzle[r][c] !== 0) return { type: 'noop' };
  if (game.pencilMode) game.pencilMarks[r][c].clear();
  else {
    game.playerBoard[r][c] = 0;
    game.pencilMarks[r][c].clear();
  }
  return { type: 'erase' };
}

/** Reveal a correct cell, preferring the selection. */
export function giveHint(game, cfg, rand = defaultRandom) {
  if (game.gameOver || !cfg.showHints) return { type: 'noop' };
  const candidates = [];
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++)
      if (game.puzzle[r][c] === 0 && game.playerBoard[r][c] !== game.solution[r][c])
        candidates.push([r, c]);
  if (!candidates.length) return { type: 'noop' };
  let target = null;
  if (game.selected) {
    const [sr, sc] = game.selected;
    if (candidates.find(([r, c]) => r === sr && c === sc)) target = [sr, sc];
  }
  if (!target) target = candidates[Math.floor(rand() * candidates.length)];
  const [r, c] = target;
  game.playerBoard[r][c] = game.solution[r][c];
  game.pencilMarks[r][c].clear();
  clearAffectedPencilMarks(game, r, c, game.solution[r][c]);
  game.hintsUsed++;
  game.selected = [r, c];
  const won = isWon(game);
  if (won) game.gameOver = true;
  return { type: 'hint', won };
}

/** Reset player entries, keeping the same puzzle. */
export function clearPuzzle(game) {
  if (game.gameOver) return { type: 'noop' };
  game.playerBoard = game.puzzle.map((r) => r.map((v) => v));
  game.pencilMarks = emptyMarks();
  game.mistakes = 0;
  game.selected = null;
  game.selectedNum = null;
  return { type: 'clear' };
}

/* ── persistence — the snapshot shape is the pre-refactor one, verbatim ── */

export function snapshot(game) {
  return {
    ts: Date.now(),
    difficulty: game.difficulty,
    puzzle: game.puzzle,
    solution: game.solution,
    playerBoard: game.playerBoard,
    pencilMarks: game.pencilMarks.map((row) => row.map((s) => [...s])),
    seconds: game.seconds,
    mistakes: game.mistakes,
    hintsUsed: game.hintsUsed,
    gameOver: game.gameOver,
  };
}

export function persist(game) {
  pushHistory(STORAGE_KEYS.sudokuHistory, snapshot(game));
}

/** Rehydrate a game from a stored snapshot (also pre-refactor shapes). */
export function fromSnapshot(s) {
  return {
    difficulty: s.difficulty,
    puzzle: s.puzzle,
    solution: s.solution,
    playerBoard: s.playerBoard,
    pencilMarks: s.pencilMarks.map((row) => row.map((a) => new Set(a))),
    seconds: s.seconds || 0,
    mistakes: s.mistakes || 0,
    hintsUsed: s.hintsUsed || 0,
    gameOver: s.gameOver || false,
    selected: null,
    selectedNum: null,
    pencilMode: false,
  };
}

/** Last saved snapshot, or null. */
export function lastSnapshot() {
  const history = loadJSON(STORAGE_KEYS.sudokuHistory, []);
  if (!history.length) return null;
  const s = history[history.length - 1];
  return s && s.puzzle ? s : null;
}
