import { el } from '../core/dom.js';

/**
 * Renders the 1–9 pad. `decorate(btn, n)` lets each game add its own
 * chrome (sudoku: count badges/selection; kakuro: dimmed digits).
 */
export function renderNumpad(container, { onTap, decorate } = {}) {
  container.innerHTML = '';
  for (let n = 1; n <= 9; n++) {
    const btn = el('div', { className: 'num-btn' }, el('span', { className: 'np-label' }, n));
    decorate?.(btn, n);
    btn.addEventListener('pointerdown', () => onTap?.(n));
    container.appendChild(btn);
  }
}
