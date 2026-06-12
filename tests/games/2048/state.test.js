// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  createState,
  newGame,
  rememberForUndo,
  undo,
  addScore,
  persist,
  restore,
  nextIdFor,
} from '../../../js/games/2048/state.js';
import { seededRandom } from '../../../js/core/random.js';

beforeEach(() => localStorage.clear());

const tileCount = (g) => g.flat().filter(Boolean).length;

describe('newGame', () => {
  it('resets everything and spawns two tiles', () => {
    const state = createState();
    state.score = 500;
    state.gameOver = true;
    state.wonAcked = new Set([2048]);
    newGame(state, seededRandom(1));
    expect(state.score).toBe(0);
    expect(state.gameOver).toBe(false);
    expect(state.gameWon).toBe(false);
    expect(state.wonAcked.size).toBe(0);
    expect(state.prevGrid).toBe(null);
    expect(tileCount(state.grid)).toBe(2);
    expect(state.uid).toBe(2);
  });

  it('keeps the stored best score', () => {
    localStorage.setItem('2048best', '1234');
    const state = createState();
    newGame(state, seededRandom(1));
    expect(state.best).toBe(1234);
  });
});

describe('undo (single level)', () => {
  it('restores the pre-move grid and score, clearing game over', () => {
    const state = createState();
    newGame(state, seededRandom(2));
    rememberForUndo(state);
    const savedGrid = JSON.parse(JSON.stringify(state.grid));
    state.score = 100;
    state.grid[0][0] = { val: 64, id: 99 };
    state.gameOver = true;
    expect(undo(state)).toBe(true);
    expect(JSON.parse(JSON.stringify(state.grid))).toEqual(savedGrid);
    expect(state.score).toBe(0);
    expect(state.gameOver).toBe(false);
  });

  it('a second undo is a no-op', () => {
    const state = createState();
    newGame(state, seededRandom(2));
    rememberForUndo(state);
    expect(undo(state)).toBe(true);
    expect(undo(state)).toBe(false);
  });

  it('refuses while an animation is in flight', () => {
    const state = createState();
    newGame(state, seededRandom(2));
    rememberForUndo(state);
    state.busy = true;
    expect(undo(state)).toBe(false);
  });
});

describe('addScore', () => {
  it('updates and persists best only on a new record', () => {
    const state = createState();
    newGame(state, seededRandom(3));
    state.best = 50;
    addScore(state, 40);
    expect(state.best).toBe(50);
    expect(localStorage.getItem('2048best')).toBe(null);
    addScore(state, 20);
    expect(state.best).toBe(60);
    expect(JSON.parse(localStorage.getItem('2048best'))).toBe(60);
  });
});

describe('persist / restore', () => {
  it('round-trips the full state through the 2048-history ring', () => {
    const state = createState();
    newGame(state, seededRandom(4));
    state.score = 128;
    state.best = 256;
    state.gameWon = true;
    state.wonAcked.add(2048);
    persist(state);

    const fresh = createState();
    expect(restore(fresh)).toBe(true);
    expect(JSON.parse(JSON.stringify(fresh.grid))).toEqual(JSON.parse(JSON.stringify(state.grid)));
    expect(fresh.score).toBe(128);
    expect(fresh.best).toBe(256);
    expect(fresh.gameWon).toBe(true);
    expect(fresh.wonAcked.has(2048)).toBe(true);
    expect(fresh.prevGrid).toBe(null); // undo never survives a reload
  });

  it('recomputes uid from the highest tile id', () => {
    const state = createState();
    newGame(state, seededRandom(5));
    state.grid[3][3] = { val: 2, id: 41 };
    persist(state);
    const fresh = createState();
    restore(fresh);
    expect(fresh.uid).toBe(41);
    expect(nextIdFor(fresh)()).toBe(42);
  });

  it('restores a pre-refactor snapshot (compatibility contract)', () => {
    // shape captured from the pre-refactor saveHistory()
    const legacy = {
      ts: 1700000000000,
      grid: [
        [{ val: 2, id: 1 }, null, null, null],
        [null, { val: 4, id: 2 }, null, null],
        [null, null, null, null],
        [null, null, null, null],
      ],
      score: 4,
      best: 2048,
      gameWon: false,
      gameOver: false,
      wonAcked: [2048],
    };
    localStorage.setItem('2048-history', JSON.stringify([legacy]));
    const state = createState();
    expect(restore(state)).toBe(true);
    expect(state.grid[1][1].val).toBe(4);
    expect(state.wonAcked.has(2048)).toBe(true);
    expect(state.uid).toBe(2);
  });

  it('returns false with no or malformed history', () => {
    const state = createState();
    expect(restore(state)).toBe(false);
    localStorage.setItem('2048-history', JSON.stringify([{ score: 1 }]));
    expect(restore(state)).toBe(false);
  });

  it('caps the ring at 20 snapshots', () => {
    const state = createState();
    newGame(state, seededRandom(6));
    for (let i = 0; i < 25; i++) {
      state.score = i;
      persist(state);
    }
    const ring = JSON.parse(localStorage.getItem('2048-history'));
    expect(ring).toHaveLength(20);
    expect(ring[19].score).toBe(24);
  });
});
