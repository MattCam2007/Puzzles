/* localStorage (JSON-safe) + the registry of every key the suite persists.
   The literal key values are the public API of our persistence: they must
   never change, or existing users' saves and themes would be orphaned. */

export const STORAGE_KEYS = {
  theme: 'puzzle-theme',
  customThemes: 'puzzle-custom-themes',
  bgImage: 'puzzle-bg-image',
  boardAlpha: 'puzzle-board-alpha',
  sudokuCfg: 'sudoku-cfg',
  sudokuHistory: 'sudoku-history',
  best2048: '2048best',
  history2048: '2048-history',
  kakuroSave: 'kakuro_save_v1',
  kakuroSettings: 'kakuro_settings_v1',
  kakuroHistory: 'kakuro-history',
  kakuroTip: 'kakuro_tip_combos',
};

export function loadJSON(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / privacy mode — saving is best-effort */
  }
}

export function removeKey(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** Circular buffer for undo / state replay. The last entry is the current state. */
export function pushHistory(key, snapshot, limit = 20) {
  const history = loadJSON(key, []);
  history.push(snapshot);
  if (history.length > limit) history.splice(0, history.length - limit);
  saveJSON(key, history);
}
