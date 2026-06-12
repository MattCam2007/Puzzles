// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  hexToRgb,
  escapeHtml,
  loadCustomThemes,
  saveCustomThemesToStorage,
  injectCustomTheme,
} from '../../js/theme/custom-themes.js';

beforeEach(() => {
  localStorage.clear();
  document.getElementById('custom-theme-style')?.remove();
});

describe('hexToRgb', () => {
  it('converts hex to an rgb triplet string', () => {
    expect(hexToRgb('#7c6af7')).toBe('124, 106, 247');
    expect(hexToRgb('#000000')).toBe('0, 0, 0');
    expect(hexToRgb('#ffffff')).toBe('255, 255, 255');
  });
  it('falls back for short/invalid input', () => {
    expect(hexToRgb('#fff')).toBe('0, 0, 0');
    expect(hexToRgb('')).toBe('0, 0, 0');
    expect(hexToRgb(null)).toBe('0, 0, 0');
  });
});

describe('escapeHtml', () => {
  it('escapes &, < and >', () => {
    expect(escapeHtml('<img src=x onerror=alert(1)>')).toBe(
      '&lt;img src=x onerror=alert(1)&gt;',
    );
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });
  it('stringifies non-strings', () => {
    expect(escapeHtml(5)).toBe('5');
  });
});

describe('load/save custom themes', () => {
  it('round-trips theme lists', () => {
    const themes = [{ id: 'custom-1', label: 'X', icon: '⭐', tokens: { '--bg': '#000000' } }];
    saveCustomThemesToStorage(themes);
    expect(loadCustomThemes()).toEqual(themes);
  });
  it('returns [] when nothing stored or storage corrupted', () => {
    expect(loadCustomThemes()).toEqual([]);
    localStorage.setItem('puzzle-custom-themes', '{not json');
    expect(loadCustomThemes()).toEqual([]);
    localStorage.setItem('puzzle-custom-themes', '"a string"');
    expect(loadCustomThemes()).toEqual([]);
  });
});

describe('injectCustomTheme', () => {
  const theme = {
    id: 'custom-42',
    label: 'Test',
    tokens: { '--bg': '#101010', '--accent': '#7c6af7', '--accent2': '#c084fc' },
  };

  it('injects a style element scoped to the theme id', () => {
    injectCustomTheme(theme);
    const style = document.getElementById('custom-theme-style');
    expect(style).not.toBe(null);
    expect(style.textContent).toContain('html[data-theme="custom-42"]');
    expect(style.textContent).toContain('--bg: #101010;');
    expect(style.textContent).toContain('--accent-rgb: 124, 106, 247');
    expect(style.textContent).toContain('--accent-dim: rgba(124, 106, 247, 0.18)');
  });

  it('reuses the same style element on re-injection', () => {
    injectCustomTheme(theme);
    injectCustomTheme({ ...theme, id: 'custom-43' });
    expect(document.querySelectorAll('#custom-theme-style')).toHaveLength(1);
    expect(document.getElementById('custom-theme-style').textContent).toContain('custom-43');
  });

  it('removes the style element when passed null', () => {
    injectCustomTheme(theme);
    injectCustomTheme(null);
    expect(document.getElementById('custom-theme-style')).toBe(null);
  });
});
