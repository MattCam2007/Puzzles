// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import { loadPage } from '../helpers/page.js';

describe('sudoku page boots', () => {
  beforeAll(async () => {
    localStorage.clear();
    loadPage('sudoku.html');
    await import('../../js/pages/sudoku.js');
  });

  it('renders 81 cells with givens and an active numpad', () => {
    expect(document.querySelectorAll('#board .cell')).toHaveLength(81);
    expect(document.querySelectorAll('#board .cell.given').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('#numpad .num-btn')).toHaveLength(9);
  });

  it('injected the shared settings sections', () => {
    expect(document.querySelector('[data-shared-settings]')).toBe(null);
    expect(document.querySelectorAll('[data-theme-pick]')).toHaveLength(4);
    expect(document.getElementById('boardAlphaSlider')).not.toBe(null);
  });

  it('renders mistake dots from the strike limit (default 3)', () => {
    expect(document.querySelectorAll('#mistakesDots .mistake-dot')).toHaveLength(3);
  });

  it('number-first play: arm a number, tap a cell, snapshot persisted', () => {
    const pads = document.querySelectorAll('#numpad .num-btn');
    pads[4].dispatchEvent(new Event('pointerdown', { bubbles: true })); // arm 5
    const empty = [...document.querySelectorAll('#board .cell')].find(
      (c) => !c.classList.contains('given'),
    );
    empty.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    const ring = JSON.parse(localStorage.getItem('sudoku-history'));
    expect(ring).not.toBe(null);
    const snap = ring.at(-1);
    expect(snap.playerBoard.flat().filter(Boolean).length).toBe(
      snap.puzzle.flat().filter(Boolean).length + 1,
    );
  });

  it('settings open syncs toggles and the theme picker', () => {
    document.getElementById('settingsBtn').click();
    expect(document.getElementById('settingsPanel').classList.contains('show')).toBe(true);
    expect(document.getElementById('togHighlight').checked).toBe(true);
    document.getElementById('settingsBackdrop').click();
    expect(document.getElementById('settingsPanel').classList.contains('show')).toBe(false);
  });

  it('typing digits with the settings panel open does not play the game (B1)', () => {
    const before = JSON.stringify(
      JSON.parse(localStorage.getItem('sudoku-history')).at(-1).playerBoard,
    );
    document.getElementById('settingsBtn').click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '5', bubbles: true }));
    const after = JSON.stringify(
      JSON.parse(localStorage.getItem('sudoku-history')).at(-1).playerBoard,
    );
    expect(after).toBe(before);
    document.getElementById('settingsBackdrop').click();
  });
});
