// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  SETTINGS_DEFAULTS,
  loadSettings,
  saveSettings,
  createGame,
  firstWhite,
  inputDigit,
  eraseSelected,
  clearEntries,
  refreshEvaluation,
  moveSelection,
  snapshot,
  persist,
  restoreGame,
  clearSaved,
} from '../../../js/games/kakuro/state.js';
import { segments } from '../../../js/games/kakuro/engine.js';

beforeEach(() => localStorage.clear());

const settings = (over = {}) => ({ ...SETTINGS_DEFAULTS, ...over });

// deterministic 5×5 easy board (same seed as the golden fixture)
const game5 = () => createGame('easy', 5, 1234);

describe('settings', () => {
  it('defaults when nothing is stored', () => {
    expect(loadSettings()).toEqual(SETTINGS_DEFAULTS);
  });

  it('round-trips through kakuro_settings_v1', () => {
    saveSettings(settings({ autocheck: true, timer: false }));
    const s = loadSettings();
    expect(s.autocheck).toBe(true);
    expect(s.timer).toBe(false);
  });

  it('backfills keys added after a user first saved settings', () => {
    // pre-refactor settings had no highlightPencil/erasePencilMarks
    localStorage.setItem(
      'kakuro_settings_v1',
      JSON.stringify({ autocheck: true, runs: false, dimpad: true, timer: true }),
    );
    const s = loadSettings();
    expect(s.highlightPencil).toBe(true);
    expect(s.erasePencilMarks).toBe(true);
    expect(s.runs).toBe(false);
  });
});

describe('createGame', () => {
  it('selects the first white cell and starts clean', () => {
    const game = game5();
    expect(game.sel).toEqual(firstWhite(game.G));
    expect(game.won).toBe(false);
    expect(game.timer).toBe(0);
    expect(game.entries.flat().every((v) => v === 0)).toBe(true);
  });
});

describe('inputDigit', () => {
  it('enters a digit, clears notes and reports a flash', () => {
    const game = game5();
    const { r, c } = game.sel;
    game.notes[r][c].add(1).add(2);
    const ev = inputDigit(game, settings(), 5);
    expect(ev).toEqual({ type: 'entry', flash: { r, c } });
    expect(game.entries[r][c]).toBe(5);
    expect(game.notes[r][c].size).toBe(0);
  });

  it('notes mode toggles marks without writing entries', () => {
    const game = game5();
    const { r, c } = game.sel;
    game.notesMode = true;
    expect(inputDigit(game, settings(), 7)).toEqual({ type: 'note' });
    expect(game.notes[r][c].has(7)).toBe(true);
    expect(game.entries[r][c]).toBe(0);
    inputDigit(game, settings(), 7);
    expect(game.notes[r][c].has(7)).toBe(false);
  });

  it('auto-erases the digit from notes within the same runs only', () => {
    const game = game5();
    const { G } = game;
    const { r, c } = game.sel;
    // mark 5 in every white cell
    for (let rr = 0; rr < G.R; rr++)
      for (let cc = 0; cc < G.C; cc++) if (G.board[rr][cc]) game.notes[rr][cc].add(5);
    inputDigit(game, settings(), 5);
    const { H, V } = segments(G.board, G.R, G.C);
    const inRun = new Set();
    for (const s of [...H, ...V])
      if (s.some(([sr, sc]) => sr === r && sc === c))
        for (const [sr, sc] of s) inRun.add(sr + ',' + sc);
    for (let rr = 0; rr < G.R; rr++)
      for (let cc = 0; cc < G.C; cc++) {
        if (!G.board[rr][cc] || (rr === r && cc === c)) continue;
        expect(game.notes[rr][cc].has(5)).toBe(!inRun.has(rr + ',' + cc));
      }
  });

  it('keeps other cells notes when erasePencilMarks is off', () => {
    const game = game5();
    const { G } = game;
    const { H } = segments(G.board, G.R, G.C);
    const run = H.find((s) => s.length >= 2);
    const [[r, c], [r2, c2]] = run;
    game.sel = { r, c };
    game.notes[r2][c2].add(5);
    inputDigit(game, settings({ erasePencilMarks: false }), 5);
    expect(game.notes[r2][c2].has(5)).toBe(true);
  });

  it('digit 0 erases; noops when won or unselected', () => {
    const game = game5();
    const { r, c } = game.sel;
    inputDigit(game, settings(), 5);
    expect(inputDigit(game, settings(), 0)).toEqual({ type: 'erase' });
    expect(game.entries[r][c]).toBe(0);
    game.won = true;
    expect(inputDigit(game, settings(), 5)).toEqual({ type: 'noop' });
    game.won = false;
    game.sel = null;
    expect(inputDigit(game, settings(), 5)).toEqual({ type: 'noop' });
  });
});

describe('eraseSelected / clearEntries', () => {
  it('erases the selected cell (value + notes)', () => {
    const game = game5();
    const { r, c } = game.sel;
    inputDigit(game, settings(), 4);
    game.notes[r][c].add(2);
    expect(eraseSelected(game)).toEqual({ type: 'erase' });
    expect(game.entries[r][c]).toBe(0);
    expect(game.notes[r][c].size).toBe(0);
  });

  it('clearEntries wipes the board and reselects the first white cell', () => {
    const game = game5();
    inputDigit(game, settings(), 3);
    game.sel = null;
    expect(clearEntries(game)).toEqual({ type: 'clear' });
    expect(game.entries.flat().every((v) => v === 0)).toBe(true);
    expect(game.sel).toEqual(firstWhite(game.G));
  });

  it('clearEntries noops once won', () => {
    const game = game5();
    game.won = true;
    expect(clearEntries(game)).toEqual({ type: 'noop' });
  });
});

describe('refreshEvaluation', () => {
  it('sets errFlags only when autocheck is on; completing the solution reports complete', () => {
    const game = game5();
    game.entries = game.G.solution.map((r) => [...r]);
    expect(refreshEvaluation(game, settings({ autocheck: false })).complete).toBe(true);
    expect(game.errFlags).toBe(null);
    game.entries[game.sel.r][game.sel.c] = (game.G.solution[game.sel.r][game.sel.c] % 9) + 1;
    const ev = refreshEvaluation(game, settings({ autocheck: true }));
    expect(ev.complete).toBe(false);
    expect(game.errFlags.flat().some(Boolean)).toBe(true);
  });
});

describe('moveSelection', () => {
  it('moves between white cells, skipping blocks, and stops at edges', () => {
    const game = game5();
    const start = { ...game.sel };
    const moved = moveSelection(game, 'ArrowRight');
    if (moved) {
      expect(game.G.board[game.sel.r][game.sel.c]).toBeTruthy();
      expect(game.sel).not.toEqual(start);
    }
    game.sel = { ...firstWhite(game.G) };
    // walking up from the topmost white cell leaves the selection unchanged
    const before = { ...game.sel };
    let guard = 0;
    while (moveSelection(game, 'ArrowUp') && guard++ < 20); // climb to the top
    const top = { ...game.sel };
    expect(moveSelection(game, 'ArrowUp')).toBe(false);
    expect(game.sel).toEqual(top);
    expect(before.r).toBeGreaterThanOrEqual(top.r);
  });
});

describe('persistence (single-write history ring)', () => {
  it('persist writes the ring only — not the legacy save key', () => {
    const game = game5();
    inputDigit(game, settings(), 5);
    persist(game);
    expect(localStorage.getItem('kakuro_save_v1')).toBe(null);
    const ring = JSON.parse(localStorage.getItem('kakuro-history'));
    expect(ring).toHaveLength(1);
    expect(ring[0].G.seed).toBe(1234);
  });

  it('persist skips finished games', () => {
    const game = game5();
    game.won = true;
    persist(game);
    expect(localStorage.getItem('kakuro-history')).toBe(null);
  });

  it('round-trips through the ring including notes Sets', () => {
    const game = game5();
    const { r, c } = game.sel;
    game.notesMode = true;
    inputDigit(game, settings(), 3);
    inputDigit(game, settings(), 8);
    game.notesMode = false;
    game.timer = 99;
    persist(game);

    const restored = restoreGame();
    expect(restored).not.toBe(null);
    expect(restored.G).toEqual(JSON.parse(JSON.stringify(game.G)));
    expect([...restored.notes[r][c]]).toEqual([3, 8]);
    expect(restored.timer).toBe(99);
    expect(restored.won).toBe(false);
    expect(restored.level).toBe('easy');
    expect(restored.size).toBe(5);
  });

  it('falls back to the pre-refactor kakuro_save_v1 key (compatibility contract)', () => {
    const game = game5();
    inputDigit(game, settings(), 6);
    // shape captured from the pre-refactor persist()
    const legacy = JSON.parse(JSON.stringify(snapshot(game)));
    localStorage.setItem('kakuro_save_v1', JSON.stringify(legacy));
    const restored = restoreGame();
    expect(restored).not.toBe(null);
    expect(restored.entries).toEqual(game.entries);
    expect(restored.sel).toEqual(firstWhite(game.G));
  });

  it('prefers the ring over the legacy key when both exist', () => {
    const game = game5();
    localStorage.setItem('kakuro_save_v1', JSON.stringify({ ...snapshot(game), timer: 1 }));
    game.timer = 555;
    persist(game);
    expect(restoreGame().timer).toBe(555);
  });

  it('clearSaved removes both stores', () => {
    const game = game5();
    persist(game);
    localStorage.setItem('kakuro_save_v1', JSON.stringify(snapshot(game)));
    clearSaved();
    expect(restoreGame()).toBe(null);
  });

  it('restoreGame is null with nothing stored or malformed data', () => {
    expect(restoreGame()).toBe(null);
    localStorage.setItem('kakuro-history', JSON.stringify([{ bad: 1 }]));
    expect(restoreGame()).toBe(null);
  });
});
