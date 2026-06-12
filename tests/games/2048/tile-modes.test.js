import { describe, it, expect } from 'vitest';
import { TILE_MODES, tileLabel } from '../../../js/games/2048/tile-modes.js';

const VALS = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096];

describe('TILE_MODES', () => {
  it('exposes the seven modes in picker order', () => {
    expect(TILE_MODES.map((m) => m.id)).toEqual([
      'numbers',
      'roman',
      'hex',
      'binary',
      'greek',
      'cursed',
      'occult',
    ]);
  });

  it.each(TILE_MODES.map((m) => [m.id]))('%s renders every tile value', (id) => {
    for (const v of VALS) {
      const { text, cls } = tileLabel(v, id);
      expect(text).toBeTruthy();
      expect(typeof cls).toBe('string');
    }
  });

  it('numbers mode is plain digits', () => {
    expect(tileLabel(2048, 'numbers')).toEqual({ text: '2048', cls: '' });
  });

  it('hex and binary are real base conversions', () => {
    expect(tileLabel(255 + 1, 'hex').text).toBe('0x100');
    expect(tileLabel(8, 'binary').text).toBe('1000');
  });

  it('roman covers the classic values and falls back to digits', () => {
    expect(tileLabel(2048, 'roman').text).toBe('MMX');
    expect(tileLabel(8192, 'roman').text).toBe('8192');
  });

  it('greek/cursed/occult use their styling classes and fallbacks', () => {
    expect(tileLabel(2048, 'greek')).toEqual({ text: 'Ω', cls: 'tile-mode-greek' });
    expect(tileLabel(8192, 'greek').text).toBe('?');
    expect(tileLabel(2, 'cursed').cls).toBe('tile-mode-emoji');
    expect(tileLabel(8192, 'cursed').text).toBe('👁️');
    const occult = tileLabel(2, 'occult');
    expect(occult.cls).toBe('tile-mode-occult');
    expect(occult.glow).toBe(true);
    expect(tileLabel(8192, 'occult').text).toBe('✦');
  });

  it('unknown mode ids fall back to numbers', () => {
    expect(tileLabel(64, 'no-such-mode')).toEqual({ text: '64', cls: '' });
    expect(tileLabel(64, undefined)).toEqual({ text: '64', cls: '' });
  });
});
