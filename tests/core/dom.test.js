// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { $, $$, el } from '../../js/core/dom.js';

beforeEach(() => {
  document.body.innerHTML = '<div id="a" class="x"></div><div class="x"></div>';
});

describe('$ / $$', () => {
  it('$ returns the first match', () => {
    expect($('#a')).toBe(document.getElementById('a'));
  });
  it('$$ returns a real array of all matches', () => {
    const all = $$('.x');
    expect(Array.isArray(all)).toBe(true);
    expect(all).toHaveLength(2);
  });
  it('supports a custom root', () => {
    const root = document.createElement('div');
    root.innerHTML = '<span class="y"></span>';
    expect($('.y', root)).not.toBe(null);
    expect($('.y')).toBe(null);
  });
});

describe('el', () => {
  it('builds an element with props and children', () => {
    const node = el(
      'div',
      { className: 'num-btn', dataset: { row: 1 } },
      el('span', {}, '5'),
      'txt',
    );
    expect(node.className).toBe('num-btn');
    expect(node.dataset.row).toBe('1');
    expect(node.children[0].tagName).toBe('SPAN');
    expect(node.textContent).toBe('5txt');
  });
  it('applies style strings', () => {
    const node = el('span', { style: 'pointer-events:none' });
    expect(node.style.pointerEvents).toBe('none');
  });
});
