// @vitest-environment jsdom
/* Regression tests for the Phase 5 bug fixes (plans/refactor-and-testing.md §5).
   B1 (input guards), B7 (single-write persistence) and B9 (delete resets the
   draft) are additionally covered in the page-boot tests. */
import { describe, it, expect, beforeEach } from 'vitest';
import { updateMistakeDots, applySettingsToUI } from '../../js/games/sudoku/render.js';
import { DEFAULTS } from '../../js/games/sudoku/state.js';
import { attachInput } from '../../js/games/2048/input.js';

describe('B2 — mistake dots render from the configured strike limit', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div class="mistakes-indicator" id="mistakesDots"></div>';
  });

  const game = (mistakes) => ({ mistakes });
  const cfg = (strikeLimit) => ({ ...DEFAULTS, strikeLimit });
  const dots = () => [...document.querySelectorAll('#mistakesDots .mistake-dot')];

  it.each([3, 5, 10])('renders %i dots for limit %i', (lim) => {
    updateMistakeDots(game(0), cfg(lim));
    expect(dots()).toHaveLength(lim);
  });

  it('mistakes 4 and 5 are visible with limit 5 (the original bug)', () => {
    updateMistakeDots(game(4), cfg(5));
    expect(dots().map((d) => d.classList.contains('used'))).toEqual([
      true,
      true,
      true,
      true,
      false,
    ]);
    updateMistakeDots(game(5), cfg(5));
    expect(dots().every((d) => d.classList.contains('used'))).toBe(true);
  });

  it('renders no dots when unlimited', () => {
    updateMistakeDots(game(2), cfg(0));
    expect(dots()).toHaveLength(0);
  });

  it('the lives wrap hides for unlimited and shows otherwise', () => {
    document.body.innerHTML = `
      <div id="mistakesWrap"></div><div id="mistakesDots"></div>
      <button id="modeToggleBtn"></button><button id="notesBtn"></button>
      <button id="hintBtn"></button><div id="numpad"></div>
      <div id="mistakeDotsRow"></div><div id="strikeRow"></div><div id="strikePicker"></div>`;
    const g = { mistakes: 0, pencilMode: false };
    applySettingsToUI(g, cfg(3));
    expect(document.getElementById('mistakesWrap').style.display).toBe('flex');
    applySettingsToUI(g, cfg(0));
    expect(document.getElementById('mistakesWrap').style.display).toBe('none');
  });
});

describe('B3 — 2048 swipe handling is scoped to the board', () => {
  it('touchmove outside the board (settings sheet) is not preventDefault-ed', () => {
    document.body.innerHTML = `
      <div class="board-wrap"></div>
      <div class="settings-panel" id="settingsPanel"><input id="bgImageUrl"></div>`;
    attachInput({ doMove: () => {}, panel: { isOpen: () => false } });

    const boardEv = new Event('touchmove', { bubbles: true, cancelable: true });
    document.querySelector('.board-wrap').dispatchEvent(boardEv);
    expect(boardEv.defaultPrevented).toBe(true); // swipes still tracked on the board

    const panelEv = new Event('touchmove', { bubbles: true, cancelable: true });
    document.getElementById('settingsPanel').dispatchEvent(panelEv);
    expect(panelEv.defaultPrevented).toBe(false); // the sheet can scroll again
  });
});
