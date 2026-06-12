/* Kakuro game state + persistence — pure (no DOM). */

import { STORAGE_KEYS, loadJSON, saveJSON, removeKey, pushHistory } from '../../core/storage.js';
import { segments, evaluate, generate } from './engine.js';

export const SETTINGS_DEFAULTS = {
  autocheck: false,
  runs: true,
  dimpad: true,
  timer: true,
  highlightPencil: true,
  erasePencilMarks: true,
};

export function loadSettings() {
  const settings = loadJSON(STORAGE_KEYS.kakuroSettings) || { ...SETTINGS_DEFAULTS };
  // keys added after a user first saved settings
  settings.highlightPencil ??= true;
  settings.erasePencilMarks ??= true;
  return settings;
}

export function saveSettings(settings) {
  saveJSON(STORAGE_KEYS.kakuroSettings, settings);
}

const emptyEntries = (R, C) => Array.from({ length: R }, () => Array(C).fill(0));
const emptyNotes = (R, C) =>
  Array.from({ length: R }, () => Array.from({ length: C }, () => new Set()));

export function firstWhite(G) {
  for (let r = 0; r < G.R; r++) for (let c = 0; c < G.C; c++) if (G.board[r][c]) return { r, c };
  return null;
}

export function createGame(level, size, seed) {
  const G = generate(level, size, seed);
  return {
    G,
    level,
    size,
    entries: emptyEntries(G.R, G.C),
    notes: emptyNotes(G.R, G.C),
    sel: firstWhite(G),
    notesMode: false,
    timer: 0,
    won: false,
    errFlags: null,
    hintedCell: null,
  };
}

/**
 * Enter digit `n` (0 = erase) at the selection, honouring notes mode.
 * @returns {{type: 'noop'|'note'|'entry'|'erase', flash?: {r,c}}}
 */
export function inputDigit(game, settings, n) {
  if (!game.sel || game.won) return { type: 'noop' };
  const { r, c } = game.sel;
  if (!game.G.board[r][c]) return { type: 'noop' };
  game.hintedCell = null;

  if (game.notesMode && n !== 0) {
    if (!game.entries[r][c]) {
      const set = game.notes[r][c];
      if (set.has(n)) set.delete(n);
      else set.add(n);
    }
    return { type: 'note' };
  }

  if (n === 0) {
    game.entries[r][c] = 0;
    return { type: 'erase' };
  }

  game.entries[r][c] = n;
  game.notes[r][c].clear();
  if (settings.erasePencilMarks) {
    const { H, V } = segments(game.G.board, game.G.R, game.G.C);
    for (const s of [...H, ...V]) {
      if (s.some(([sr, sc]) => sr === r && sc === c)) {
        for (const [sr, sc] of s) {
          if (sr !== r || sc !== c) game.notes[sr][sc].delete(n);
        }
      }
    }
  }
  return { type: 'entry', flash: { r, c } };
}

export function eraseSelected(game) {
  if (!game.sel || game.won) return { type: 'noop' };
  const { r, c } = game.sel;
  if (!game.G.board[r][c]) return { type: 'noop' };
  game.entries[r][c] = 0;
  game.notes[r][c].clear();
  game.hintedCell = null;
  return { type: 'erase' };
}

export function clearEntries(game) {
  if (!game.G || game.won) return { type: 'noop' };
  game.entries = emptyEntries(game.G.R, game.G.C);
  game.notes = emptyNotes(game.G.R, game.G.C);
  game.hintedCell = null;
  game.errFlags = null;
  game.sel = firstWhite(game.G);
  return { type: 'clear' };
}

/** Recompute error flags (autocheck) and report completion. */
export function refreshEvaluation(game, settings) {
  const ev = evaluate(game.G.board, game.G.clues, game.G.R, game.G.C, game.entries);
  game.errFlags = settings.autocheck ? ev.err : null;
  return ev;
}

export function moveSelection(game, dir) {
  if (!game.sel) return false;
  let { r, c } = game.sel;
  const dr = dir === 'ArrowUp' ? -1 : dir === 'ArrowDown' ? 1 : 0;
  const dc = dir === 'ArrowLeft' ? -1 : dir === 'ArrowRight' ? 1 : 0;
  for (let step = 0; step < Math.max(game.G.R, game.G.C); step++) {
    r += dr;
    c += dc;
    if (r < 0 || c < 0 || r >= game.G.R || c >= game.G.C) return false;
    if (game.G.board[r][c]) {
      game.sel = { r, c };
      game.hintedCell = null;
      return true;
    }
  }
  return false;
}

/* ── persistence ──
   The snapshot shape is the pre-refactor kakuro_save_v1 shape. The history
   ring is now the single store (the old code wrote the full state to both
   the save key and the ring on every keystroke); restore still reads the
   legacy save key as a fallback so pre-refactor saves keep working. */

export function snapshot(game) {
  const { G } = game;
  return {
    G: {
      R: G.R,
      C: G.C,
      board: G.board,
      clues: G.clues,
      solution: G.solution,
      level: G.level,
      seed: G.seed,
    },
    entries: game.entries,
    notes: game.notes.map((r) => r.map((s) => [...s])),
    timer: game.timer,
    level: game.level,
    size: game.size,
  };
}

export function persist(game) {
  if (!game.G || game.won) return;
  pushHistory(STORAGE_KEYS.kakuroHistory, { ts: Date.now(), ...snapshot(game) });
}

export function clearSaved() {
  removeKey(STORAGE_KEYS.kakuroSave);
  removeKey(STORAGE_KEYS.kakuroHistory);
}

/** @returns {object | null} rehydrated game, or null when nothing is saved. */
export function restoreGame() {
  const ring = loadJSON(STORAGE_KEYS.kakuroHistory, []);
  let s = ring.length ? ring[ring.length - 1] : null;
  if (!s || !s.G) s = loadJSON(STORAGE_KEYS.kakuroSave); // pre-refactor save
  if (!s || !s.G) return null;
  return {
    G: s.G,
    entries: s.entries,
    notes: s.notes.map((r) => r.map((a) => new Set(a))),
    timer: s.timer || 0,
    level: s.level || s.G.level || 'easy',
    size: s.size || s.G.R - 1,
    sel: firstWhite(s.G),
    notesMode: false,
    won: false,
    errFlags: null,
    hintedCell: null,
  };
}
