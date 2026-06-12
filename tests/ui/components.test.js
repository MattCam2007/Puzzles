// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderPickList } from '../../js/ui/pick-list.js';
import { renderNumpad } from '../../js/ui/numpad.js';
import { injectSharedSections } from '../../js/ui/shared-sections.js';
import { showOverlay, hideOverlay, overlayVisible } from '../../js/ui/overlay.js';
import { createToast } from '../../js/ui/toast.js';
import { THEMES } from '../../js/theme/theme.js';

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('renderPickList', () => {
  const items = [
    { id: 'a', icon: '✨', label: 'Clean' },
    { id: 'b', icon: '⚡', label: 'Neon' },
  ];

  it('renders one selected row per item and fires onPick', () => {
    const container = document.createElement('div');
    const onPick = vi.fn();
    renderPickList(container, items, 'b', onPick);
    const rows = container.querySelectorAll('.pick-row');
    expect(rows).toHaveLength(2);
    expect(rows[0].classList.contains('selected')).toBe(false);
    expect(rows[1].classList.contains('selected')).toBe(true);
    rows[0].click();
    expect(onPick).toHaveBeenCalledWith('a');
  });

  it('escapes user-provided labels', () => {
    const container = document.createElement('div');
    renderPickList(container, [{ id: 'x', icon: '🎨', label: '<img src=x>' }], null, () => {});
    expect(container.querySelector('img')).toBe(null);
    expect(container.textContent).toContain('<img src=x>');
  });
});

describe('renderNumpad', () => {
  it('renders 9 buttons, invokes the decorator per button, taps report the digit', () => {
    const container = document.createElement('div');
    const onTap = vi.fn();
    const decorate = vi.fn();
    renderNumpad(container, { onTap, decorate });
    const btns = container.querySelectorAll('.num-btn');
    expect(btns).toHaveLength(9);
    expect(decorate).toHaveBeenCalledTimes(9);
    expect(decorate).toHaveBeenNthCalledWith(5, btns[4], 5);
    expect(btns[6].querySelector('.np-label').textContent).toBe('7');
    btns[2].dispatchEvent(new Event('pointerdown'));
    expect(onTap).toHaveBeenCalledWith(3);
  });
});

describe('injectSharedSections', () => {
  it('replaces the placeholder with one theme row per THEMES entry plus bg controls', () => {
    document.body.innerHTML = '<div class="settings-panel"><div data-shared-settings></div></div>';
    injectSharedSections();
    expect(document.querySelector('[data-shared-settings]')).toBe(null);
    const rows = document.querySelectorAll('[data-theme-pick]');
    expect(rows).toHaveLength(THEMES.length);
    expect([...rows].map((r) => r.dataset.themePick)).toEqual(THEMES.map((t) => t.id));
    for (const id of [
      'customThemesList',
      'boardAlphaSlider',
      'bgUploadRow',
      'bgImageUrl',
      'bgImageFile',
      'clearBgBtn',
    ]) {
      expect(document.getElementById(id)).not.toBe(null);
    }
    expect(document.querySelector('.pick-row-link').getAttribute('href')).toBe(
      'theme-builder.html',
    );
  });

  it('no-ops on pages without the placeholder', () => {
    document.body.innerHTML = '<div id="x"></div>';
    expect(() => injectSharedSections()).not.toThrow();
    expect(document.body.innerHTML).toBe('<div id="x"></div>');
  });
});

describe('overlay', () => {
  it('shows title/message and hides again', () => {
    document.body.innerHTML = `
      <div class="overlay" id="overlay">
        <h2 id="overlayTitle"></h2><p id="overlayMsg"></p>
      </div>`;
    showOverlay('🎉 Solved!', 'Nice one.');
    expect(overlayVisible()).toBe(true);
    expect(document.getElementById('overlayTitle').textContent).toBe('🎉 Solved!');
    expect(document.getElementById('overlayMsg').textContent).toBe('Nice one.');
    hideOverlay();
    expect(overlayVisible()).toBe(false);
  });
});

describe('toast', () => {
  it('shows a message with a kind class and auto-hides', () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div class="toast" id="toast"></div>';
    const toastEl = document.getElementById('toast');
    const toast = createToast(toastEl);
    toast('Building a fresh grid…', 'cyan', 700);
    expect(toastEl.textContent).toBe('Building a fresh grid…');
    expect(toastEl.className).toBe('toast show cyan');
    vi.advanceTimersByTime(700);
    expect(toastEl.classList.contains('show')).toBe(false);
    vi.useRealTimers();
  });

  it('a second toast resets the hide timer', () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div class="toast" id="toast"></div>';
    const toastEl = document.getElementById('toast');
    const toast = createToast(toastEl);
    toast('one', null, 1000);
    vi.advanceTimersByTime(800);
    toast('two'); // default 1300ms
    vi.advanceTimersByTime(500);
    expect(toastEl.classList.contains('show')).toBe(true); // old timer cancelled
    vi.advanceTimersByTime(800);
    expect(toastEl.classList.contains('show')).toBe(false);
    vi.useRealTimers();
  });
});
