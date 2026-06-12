// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadJSON, saveJSON, removeKey, pushHistory, STORAGE_KEYS } from '../../js/core/storage.js';

beforeEach(() => localStorage.clear());

describe('loadJSON / saveJSON', () => {
  it('round-trips values', () => {
    saveJSON('k', { a: 1, b: [2, 3], c: 'x' });
    expect(loadJSON('k')).toEqual({ a: 1, b: [2, 3], c: 'x' });
  });

  it('returns the fallback for a missing key', () => {
    expect(loadJSON('missing', 'fb')).toBe('fb');
    expect(loadJSON('missing')).toBe(null);
  });

  it('returns the fallback for corrupted JSON', () => {
    localStorage.setItem('bad', '{nope');
    expect(loadJSON('bad', 42)).toBe(42);
  });

  it('swallows quota errors on save', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    expect(() => saveJSON('k', 'v')).not.toThrow();
    spy.mockRestore();
  });
});

describe('removeKey', () => {
  it('removes a stored key', () => {
    saveJSON('k', 1);
    removeKey('k');
    expect(loadJSON('k', 'gone')).toBe('gone');
  });
});

describe('pushHistory', () => {
  it('appends snapshots, newest last', () => {
    pushHistory('h', { n: 1 });
    pushHistory('h', { n: 2 });
    expect(loadJSON('h')).toEqual([{ n: 1 }, { n: 2 }]);
  });

  it('caps the ring at the limit, dropping oldest entries', () => {
    for (let i = 0; i < 25; i++) pushHistory('h', i, 20);
    const ring = loadJSON('h');
    expect(ring).toHaveLength(20);
    expect(ring[0]).toBe(5);
    expect(ring[19]).toBe(24);
  });

  it('defaults the limit to 20', () => {
    for (let i = 0; i < 30; i++) pushHistory('h', i);
    expect(loadJSON('h')).toHaveLength(20);
  });
});

describe('STORAGE_KEYS', () => {
  it('pins the exact production key strings (the persistence contract)', () => {
    expect(STORAGE_KEYS).toEqual({
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
    });
  });
});
