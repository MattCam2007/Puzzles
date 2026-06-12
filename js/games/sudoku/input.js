/* Sudoku input — pointer/keyboard events become state intents. */

import { isTypingTarget } from '../../ui/settings-panel.js';

/**
 * @param {object} ctx {
 *   game getter, cfg, panel (settings panel),
 *   onPlace(r, c, n), onSelect(), onErase(), togglePencil(),
 * }
 */
export function handleCellTap(ctx, r, c) {
  const game = ctx.game();
  if (game.gameOver) return;

  if (ctx.cfg.inputMode === 'number') {
    // number-first: if a number is armed, fill/pencil this cell
    if (game.selectedNum !== null) {
      ctx.onPlace(r, c, game.selectedNum);
    }
    // also select the cell for highlighting
    game.selected = [r, c];
    ctx.onSelect();
    return;
  }

  // cell-first
  game.selected = [r, c];
  ctx.onSelect();
}

export function handleNumTap(ctx, n) {
  const game = ctx.game();
  if (game.gameOver) return;

  if (ctx.cfg.inputMode === 'number') {
    if (game.selectedNum === n) {
      // tapping the same number deselects it
      game.selectedNum = null;
    } else {
      // switching to a new number — clear any lingering cell selection
      // so the new number doesn't fire into the last-touched cell
      game.selectedNum = n;
      game.selected = null;
    }
    ctx.onArmNumber();
    return;
  }

  // cell-first: need selected cell
  if (!game.selected) return;
  ctx.onPlace(game.selected[0], game.selected[1], n);
}

export function attachKeyboard(ctx) {
  document.addEventListener('keydown', (e) => {
    const game = ctx.game();
    if (!ctx.cfg.useKeyboard || game.gameOver) return;
    // never steal keystrokes from the settings sheet or text inputs
    if (ctx.panel.isOpen() || isTypingTarget(e.target)) return;

    if (e.key >= '1' && e.key <= '9') {
      handleNumTap(ctx, +e.key);
      return;
    }
    if (e.key === 'Backspace' || e.key === 'Delete') {
      ctx.onErase();
      return;
    }
    if (e.key === 'p' || e.key === 'P') {
      ctx.togglePencil();
      return;
    }
    // arrow navigation (cell-first only)
    if (ctx.cfg.inputMode === 'cell' && game.selected) {
      let [r, c] = game.selected;
      if (e.key === 'ArrowUp' && r > 0) r--;
      else if (e.key === 'ArrowDown' && r < 8) r++;
      else if (e.key === 'ArrowLeft' && c > 0) c--;
      else if (e.key === 'ArrowRight' && c < 8) c++;
      else return;
      game.selected = [r, c];
      ctx.onSelect();
      e.preventDefault();
    }
  });
}
