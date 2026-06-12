// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import { loadPage, stubCanvasAndAnimations } from '../helpers/page.js';

describe('2048 page boots', () => {
  beforeAll(async () => {
    localStorage.clear();
    stubCanvasAndAnimations();
    loadPage('2048.html');
    await import('../../js/pages/2048.js');
  });

  it('renders the bg grid, two starting tiles, and pickers', () => {
    expect(document.querySelectorAll('#bgGrid .bg-cell')).toHaveLength(16);
    expect(document.querySelectorAll('#tc .tile')).toHaveLength(2);
    expect(document.querySelectorAll('#animPicker .pick-row')).toHaveLength(7);
    expect(document.querySelectorAll('#tilePicker .pick-row')).toHaveLength(7);
    expect(document.getElementById('undoBtn').disabled).toBe(true);
  });

  it('injected the shared settings sections', () => {
    expect(document.querySelector('[data-shared-settings]')).toBe(null);
    expect(document.querySelectorAll('[data-theme-pick]')).toHaveLength(4);
  });

  it('an arrow key makes a move: score UI updates and a snapshot persists', async () => {
    // with only two tiles, at least one of the four directions moves
    for (const key of ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown']) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      await new Promise((r) => setTimeout(r, 20));
      if (localStorage.getItem('2048-history')) break;
    }
    const ring = JSON.parse(localStorage.getItem('2048-history'));
    expect(ring).not.toBe(null);
    expect(ring.at(-1).grid.flat().filter(Boolean).length).toBe(3); // 2 tiles + 1 spawn
    expect(document.getElementById('undoBtn').disabled).toBe(false);
  });

  it('undo returns to the pre-move grid and disables itself', () => {
    document.getElementById('undoBtn').click();
    expect(document.querySelectorAll('#tc .tile')).toHaveLength(2);
    expect(document.getElementById('undoBtn').disabled).toBe(true);
  });

  it('arrow keys with the settings panel open do not move tiles (B1)', async () => {
    document.getElementById('settingsBtn').click();
    const before = document.querySelectorAll('#tc .tile').length;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    await new Promise((r) => setTimeout(r, 20));
    expect(document.querySelectorAll('#tc .tile')).toHaveLength(before);
    document.getElementById('settingsBackdrop').click();
  });

  it('selecting a tile mode re-renders and marks the row selected', () => {
    const rows = document.querySelectorAll('#tilePicker .pick-row');
    rows[2].click(); // hex
    expect(
      document.querySelectorAll('#tilePicker .pick-row')[2].classList.contains('selected'),
    ).toBe(true);
    const tile = document.querySelector('#tc .tile');
    expect(tile.textContent.startsWith('0x')).toBe(true);
  });
});
