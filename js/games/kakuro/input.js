/* Kakuro keyboard input. */

import { $ } from '../../core/dom.js';
import { isTypingTarget } from '../../ui/settings-panel.js';

/**
 * @param {object} ctx {
 *   onDigit(n), onErase(), toggleNotes(), onHint(),
 *   onMove(arrowKey), onOverlayEnter(), panel
 * }
 */
export function attachKeyboard(ctx) {
  document.addEventListener('keydown', (e) => {
    if ($('#overlay').classList.contains('show')) {
      if (e.key === 'Enter') ctx.onOverlayEnter();
      return;
    }
    if (ctx.panel.isOpen() || isTypingTarget(e.target)) return;
    if ($('#comboSheet').classList.contains('show')) {
      if (e.key === 'Escape') $('#comboSheet').classList.remove('show');
      return;
    }
    if (e.key >= '1' && e.key <= '9') {
      ctx.onDigit(+e.key);
      e.preventDefault();
    } else if (e.key === '0' || e.key === 'Backspace' || e.key === 'Delete') {
      ctx.onErase();
      e.preventDefault();
    } else if (e.key === 'n' || e.key === 'N') {
      ctx.toggleNotes();
    } else if (e.key.startsWith('Arrow')) {
      ctx.onMove(e.key);
      e.preventDefault();
    } else if (e.key === 'h' || e.key === 'H') {
      ctx.onHint();
    }
  });
}
