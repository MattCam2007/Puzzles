// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import { loadPage } from '../helpers/page.js';

describe('kakuro page boots', () => {
  beforeAll(async () => {
    localStorage.clear();
    loadPage('kakuro.html');
    await import('../../js/pages/kakuro.js');
    // newGame defers generation so the toast can paint first
    await new Promise((resolve) => setTimeout(resolve, 120));
  });

  it('renders a 6×6 board with clue, block and white cells', () => {
    const cells = document.querySelectorAll('#board .cell');
    expect(cells).toHaveLength(36);
    expect(document.querySelectorAll('#board .cell.white').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('#board .cell.clue').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('#numpad .num-btn')).toHaveLength(9);
  });

  it('injected the shared settings sections', () => {
    expect(document.querySelector('[data-shared-settings]')).toBe(null);
    expect(document.querySelectorAll('[data-theme-pick]')).toHaveLength(4);
  });

  it('selects the first white cell and persists to the history ring on input', () => {
    expect(document.querySelector('#board .cell.sel')).not.toBe(null);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '5', bubbles: true }));
    const ring = JSON.parse(localStorage.getItem('kakuro-history'));
    expect(ring).not.toBe(null);
    expect(ring.at(-1).entries.flat()).toContain(5);
    // single-write fix: the legacy save key is no longer written
    expect(localStorage.getItem('kakuro_save_v1')).toBe(null);
  });

  it('tapping a clue opens the combinations sheet', () => {
    const clue = [...document.querySelectorAll('#board .cell.clue.tappable')][0];
    clue.dispatchEvent(new window.MouseEvent('click', { bubbles: true, clientX: 5, clientY: 5 }));
    expect(document.getElementById('comboSheet').classList.contains('show')).toBe(true);
    expect(document.getElementById('comboTitle').textContent).toMatch(/Across|Down/);
    document.getElementById('closeCombo').click();
    expect(document.getElementById('comboSheet').classList.contains('show')).toBe(false);
  });

  it('keyboard input is ignored while the settings sheet is open (existing guard)', () => {
    const before = JSON.stringify(
      JSON.parse(localStorage.getItem('kakuro-history')).at(-1).entries,
    );
    document.getElementById('settingsBtn').click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '9', bubbles: true }));
    const after = JSON.stringify(JSON.parse(localStorage.getItem('kakuro-history')).at(-1).entries);
    expect(after).toBe(before);
    document.getElementById('settingsBackdrop').click();
  });
});
