/* 2048 game state + persistence — pure (no DOM). */

import { STORAGE_KEYS, loadJSON, saveJSON, pushHistory } from '../../core/storage.js';
import { defaultRandom } from '../../core/random.js';
import { mkGrid, deepClone, spawnTile, N } from './engine.js';

export function createState() {
  return {
    grid: mkGrid(),
    score: 0,
    best: loadJSON(STORAGE_KEYS.best2048, 0),
    prevGrid: null,
    prevScore: null,
    gameWon: false,
    gameOver: false,
    busy: false,
    wonAcked: new Set(),
    uid: 0,
  };
}

export function nextIdFor(state) {
  return () => ++state.uid;
}

export function newGame(state, rand = defaultRandom) {
  state.grid = mkGrid();
  state.score = 0;
  state.gameWon = false;
  state.gameOver = false;
  state.busy = false;
  state.wonAcked = new Set();
  state.prevGrid = null;
  state.prevScore = null;
  state.uid = 0;
  state.best = loadJSON(STORAGE_KEYS.best2048, 0);
  spawnTile(state.grid, rand, nextIdFor(state));
  spawnTile(state.grid, rand, nextIdFor(state));
}

/** Remember the pre-move position for the single-level undo. */
export function rememberForUndo(state) {
  state.prevGrid = deepClone(state.grid);
  state.prevScore = state.score;
}

/** @returns {boolean} true when an undo was applied (second undo is a no-op). */
export function undo(state) {
  if (!state.prevGrid || state.busy) return false;
  state.grid = state.prevGrid;
  state.score = state.prevScore;
  state.prevGrid = null;
  state.prevScore = null;
  state.gameOver = false;
  return true;
}

export function addScore(state, gained) {
  state.score += gained;
  if (state.score > state.best) {
    state.best = state.score;
    saveJSON(STORAGE_KEYS.best2048, state.best);
  }
}

/* ── persistence — the snapshot shape is the pre-refactor one, verbatim ── */

export function persist(state) {
  pushHistory(STORAGE_KEYS.history2048, {
    ts: Date.now(),
    grid: state.grid,
    score: state.score,
    best: state.best,
    gameWon: state.gameWon,
    gameOver: state.gameOver,
    wonAcked: [...state.wonAcked],
  });
}

/** @returns {boolean} true when a saved game was restored into `state`. */
export function restore(state) {
  const history = loadJSON(STORAGE_KEYS.history2048, []);
  if (!history.length) return false;
  const s = history[history.length - 1];
  if (!s || !s.grid) return false;
  state.grid = s.grid;
  state.score = s.score;
  state.best = s.best;
  state.gameWon = s.gameWon;
  state.gameOver = s.gameOver;
  state.busy = false;
  state.wonAcked = new Set(s.wonAcked || []);
  state.prevGrid = null;
  state.prevScore = null;
  state.uid = 0;
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++)
      if (state.grid[r][c]?.id > state.uid) state.uid = state.grid[r][c].id;
  return true;
}
