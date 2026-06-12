/* Sudoku composition root: owns the "after any change: render + persist"
   policy and wires state ↔ render ↔ input together. */

import { $ } from '../../core/dom.js';
import { formatTime, createTicker } from '../../core/time.js';
import { initSettingsPanel } from '../../ui/settings-panel.js';
import { showOverlay, hideOverlay } from '../../ui/overlay.js';
import { syncThemePicker } from '../../theme/theme-picker.js';
import {
  loadCfg,
  saveCfg,
  createGame,
  fromSnapshot,
  lastSnapshot,
  persist,
  placeNumber,
  eraseCell,
  giveHint,
  clearPuzzle,
} from './state.js';
import {
  renderBoard,
  renderNumpad,
  applyHighlights,
  updateMistakeDots,
  applySettingsToUI,
  syncPencilBtn,
  updateCellSize,
} from './render.js';
import { handleCellTap, handleNumTap, attachKeyboard } from './input.js';
import { initSettings, syncSettingsUI } from './settings.js';

export function boot() {
  const cfg = loadCfg();
  let game = null;

  const ticker = createTicker(() => {
    game.seconds++;
    $('#timer').textContent = formatTime(game.seconds);
  });

  const panel = initSettingsPanel({
    onOpen: () => {
      syncSettingsUI(cfg);
      syncThemePicker();
    },
  });

  function refreshBoard() {
    renderBoard(game, cfg, (r, c) => handleCellTap(ctx, r, c));
    renderNumpad(game, cfg, (n) => handleNumTap(ctx, n));
  }

  function refreshAll() {
    applySettingsToUI(game, cfg);
    refreshBoard();
    updateMistakeDots(game, cfg);
  }

  function endGame(won) {
    game.gameOver = true;
    ticker.stop();
    const ts = formatTime(game.seconds);
    const m = game.mistakes;
    const h = game.hintsUsed;
    showOverlay(
      won ? '🎉 Solved!' : '💀 Game Over',
      won
        ? `Finished in ${ts} with ${m} mistake${m !== 1 ? 's' : ''} and ${h} hint${h !== 1 ? 's' : ''}.`
        : `You hit the ${cfg.strikeLimit}-strike limit. Better luck next time!`,
    );
  }

  /** The one place that reacts to state events. */
  function applyEvent(ev) {
    if (ev.type === 'noop') return;
    if (ev.type === 'lose') {
      refreshBoard();
      updateMistakeDots(game, cfg);
      endGame(false);
      persist(game);
      return;
    }
    refreshBoard();
    updateMistakeDots(game, cfg);
    if ((ev.type === 'place' || ev.type === 'hint') && ev.won) endGame(true);
    persist(game);
  }

  const ctx = {
    game: () => game,
    cfg,
    panel,
    onPlace: (r, c, n) => applyEvent(placeNumber(game, cfg, r, c, n)),
    onSelect: () => applyHighlights(game, cfg),
    onArmNumber: () => refreshBoard(),
    onErase: () => applyEvent(eraseCell(game)),
    togglePencil: () => setPencilMode(!game.pencilMode),
  };

  function setPencilMode(on) {
    game.pencilMode = on;
    syncPencilBtn(game);
  }

  function startGame() {
    game = createGame($('#difficultySelect').value);
    ticker.stop();
    $('#timer').textContent = formatTime(0);
    ticker.start();
    hideOverlay();
    refreshAll();
  }

  function restore() {
    const s = lastSnapshot();
    if (!s) return false;
    game = fromSnapshot(s);
    if (s.difficulty) $('#difficultySelect').value = s.difficulty;
    $('#timer').textContent = formatTime(game.seconds);
    refreshAll();
    if (game.gameOver) {
      // a finished game must not restore as a dead board: re-show the result
      const won = game.playerBoard.every((row, r) =>
        row.every((v, c) => v === game.solution[r][c]),
      );
      endGame(won);
    } else {
      ticker.start();
      hideOverlay();
    }
    return true;
  }

  /* main buttons */
  $('#newGameBtn').addEventListener('click', startGame);
  $('#overlayBtn').addEventListener('click', startGame);
  $('#clearBtn').addEventListener('click', () => {
    const ev = clearPuzzle(game);
    if (ev.type === 'noop') return;
    refreshBoard();
    updateMistakeDots(game, cfg);
    persist(game);
  });
  $('#eraseBtn').addEventListener('click', () => ctx.onErase());
  $('#hintBtn').addEventListener('click', () => applyEvent(giveHint(game, cfg)));
  $('#notesBtn').addEventListener('click', () => setPencilMode(!game.pencilMode));
  $('#modeToggleBtn').addEventListener('click', () => {
    setInputMode(cfg.inputMode === 'cell' ? 'number' : 'cell');
  });

  function setInputMode(mode) {
    cfg.inputMode = mode;
    if (mode === 'number') game.selected = null;
    else game.selectedNum = null;
    saveCfg(cfg);
    syncSettingsUI(cfg);
    refreshAll();
  }

  initSettings(cfg, refreshAll, setInputMode);
  attachKeyboard(ctx);

  window.addEventListener('resize', updateCellSize);
  updateCellSize();
  if (!restore()) startGame();
}
