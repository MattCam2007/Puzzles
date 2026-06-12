// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  applyBgImage,
  loadBgImage,
  getSavedBgImage,
  applyBoardAlpha,
  loadBoardAlpha,
  getSavedBoardAlpha,
} from '../../js/theme/background.js';

const rootStyle = () => document.documentElement.style;

beforeEach(() => {
  localStorage.clear();
  rootStyle().removeProperty('--bg-image');
  rootStyle().removeProperty('--board-alpha');
});

describe('background image', () => {
  it('applies and persists a URL', () => {
    applyBgImage('https://example.com/a.png');
    expect(rootStyle().getPropertyValue('--bg-image')).toBe('url("https://example.com/a.png")');
    expect(localStorage.getItem('puzzle-bg-image')).toBe('https://example.com/a.png');
    expect(getSavedBgImage()).toBe('https://example.com/a.png');
  });

  it('clears the property and the key when passed null', () => {
    applyBgImage('https://example.com/a.png');
    applyBgImage(null);
    expect(rootStyle().getPropertyValue('--bg-image')).toBe('');
    expect(getSavedBgImage()).toBe(null);
  });

  it('loadBgImage restores a saved image and no-ops otherwise', () => {
    loadBgImage();
    expect(rootStyle().getPropertyValue('--bg-image')).toBe('');
    localStorage.setItem('puzzle-bg-image', 'x.png');
    loadBgImage();
    expect(rootStyle().getPropertyValue('--bg-image')).toBe('url("x.png")');
  });
});

describe('board alpha', () => {
  it('applies and persists the value as a percentage', () => {
    applyBoardAlpha(60);
    expect(rootStyle().getPropertyValue('--board-alpha')).toBe('60%');
    expect(localStorage.getItem('puzzle-board-alpha')).toBe('60');
    expect(getSavedBoardAlpha()).toBe(60);
  });

  it('defaults to 100 with nothing saved', () => {
    expect(getSavedBoardAlpha()).toBe(100);
    loadBoardAlpha();
    expect(rootStyle().getPropertyValue('--board-alpha')).toBe('100%');
  });

  it('loadBoardAlpha restores the saved value', () => {
    localStorage.setItem('puzzle-board-alpha', '35');
    loadBoardAlpha();
    expect(rootStyle().getPropertyValue('--board-alpha')).toBe('35%');
  });
});
