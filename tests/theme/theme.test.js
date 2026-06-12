// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { THEMES, applyTheme, loadTheme } from '../../js/theme/theme.js';
import { saveCustomThemesToStorage } from '../../js/theme/custom-themes.js';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  document.getElementById('custom-theme-style')?.remove();
  document.body.innerHTML = '';
});

describe('THEMES', () => {
  it('lists the four built-ins in order', () => {
    expect(THEMES.map((t) => t.id)).toEqual(['galaxy', 'midnight', 'sakura', 'terminal']);
    for (const t of THEMES) {
      expect(t.icon).toBeTruthy();
      expect(t.label).toBeTruthy();
    }
  });
});

describe('applyTheme', () => {
  it('sets data-theme and persists under puzzle-theme', () => {
    applyTheme('sakura');
    expect(document.documentElement.getAttribute('data-theme')).toBe('sakura');
    expect(localStorage.getItem('puzzle-theme')).toBe('sakura');
  });

  it('defaults to galaxy when id is falsy', () => {
    applyTheme(null);
    expect(document.documentElement.getAttribute('data-theme')).toBe('galaxy');
    expect(localStorage.getItem('puzzle-theme')).toBe('galaxy');
  });

  it('injects CSS for custom themes and removes it for built-ins', () => {
    saveCustomThemesToStorage([
      { id: 'custom-9', label: 'C', tokens: { '--bg': '#111111', '--accent': '#222222' } },
    ]);
    applyTheme('custom-9');
    expect(document.getElementById('custom-theme-style')).not.toBe(null);
    applyTheme('galaxy');
    expect(document.getElementById('custom-theme-style')).toBe(null);
  });

  it('marks the matching pick-row selected', () => {
    document.body.innerHTML = `
      <div class="pick-row" data-theme-pick="galaxy"></div>
      <div class="pick-row" data-theme-pick="terminal"></div>`;
    applyTheme('terminal');
    expect(document.querySelector('[data-theme-pick="terminal"]').classList.contains('selected')).toBe(true);
    expect(document.querySelector('[data-theme-pick="galaxy"]').classList.contains('selected')).toBe(false);
  });
});

describe('loadTheme', () => {
  it('restores the saved theme', () => {
    localStorage.setItem('puzzle-theme', 'midnight');
    loadTheme();
    expect(document.documentElement.getAttribute('data-theme')).toBe('midnight');
  });

  it('defaults to galaxy with nothing saved', () => {
    loadTheme();
    expect(document.documentElement.getAttribute('data-theme')).toBe('galaxy');
  });

  it('re-injects a saved custom theme CSS', () => {
    saveCustomThemesToStorage([
      { id: 'custom-7', label: 'C', tokens: { '--bg': '#101010' } },
    ]);
    localStorage.setItem('puzzle-theme', 'custom-7');
    loadTheme();
    expect(document.documentElement.getAttribute('data-theme')).toBe('custom-7');
    expect(document.getElementById('custom-theme-style')).not.toBe(null);
  });
});
