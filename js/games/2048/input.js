/* 2048 input: keyboard + touch swipe → move intents. */

import { isTypingTarget } from '../../ui/settings-panel.js';

const KEYMAP = {
  ArrowUp: 0,
  w: 0,
  W: 0,
  ArrowRight: 1,
  d: 1,
  D: 1,
  ArrowDown: 2,
  s: 2,
  S: 2,
  ArrowLeft: 3,
  a: 3,
  A: 3,
};

/**
 * @param {{ doMove(dir): void, panel: { isOpen(): boolean } }} ctx
 */
export function attachInput(ctx) {
  document.addEventListener('keydown', (e) => {
    if (KEYMAP[e.key] === undefined) return;
    // arrows must keep working in the settings sheet's text inputs
    if (ctx.panel.isOpen() || isTypingTarget(e.target)) return;
    e.preventDefault();
    ctx.doMove(KEYMAP[e.key]);
  });

  // Swipes are handled on the board only, so the settings sheet and
  // dropdowns stay scrollable on touch devices.
  const board = document.querySelector('.board-wrap');
  let tx = 0;
  let ty = 0;
  let tActive = false;
  board.addEventListener(
    'touchstart',
    (e) => {
      tx = e.touches[0].clientX;
      ty = e.touches[0].clientY;
      tActive = true;
    },
    { passive: false },
  );
  board.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  board.addEventListener(
    'touchend',
    (e) => {
      if (!tActive) return;
      tActive = false;
      const dx = e.changedTouches[0].clientX - tx;
      const dy = e.changedTouches[0].clientY - ty;
      if (Math.abs(dx) < 15 && Math.abs(dy) < 15) return;
      if (Math.abs(dx) > Math.abs(dy)) ctx.doMove(dx > 0 ? 1 : 3);
      else ctx.doMove(dy > 0 ? 2 : 0);
    },
    { passive: false },
  );
}
