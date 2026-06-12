/* 2048 composition root. */

import { $ } from '../../core/dom.js';
import { initSettingsPanel } from '../../ui/settings-panel.js';
import { renderPickList } from '../../ui/pick-list.js';
import { syncThemePicker } from '../../theme/theme-picker.js';
import { computeMove, spawnTile, hasMoves, highestTile, WIN_MILESTONES } from './engine.js';
import { TILE_MODES } from './tile-modes.js';
import { ANIMS, createFx } from './fx/effects.js';
import {
  createState,
  newGame as resetState,
  restore,
  persist,
  undo,
  rememberForUndo,
  addScore,
  nextIdFor,
} from './state.js';
import {
  createRenderer,
  buildBg,
  updateUI,
  showBanner,
  hideBanner,
  tileCentre,
  cellSize,
  boardRect,
} from './render.js';
import { attachInput } from './input.js';

export function boot() {
  const state = createState();
  let currentAnim = 'clean';
  let currentTileMode = 'numbers';

  const fx = createFx($('#fx'), { tileCentre, cellSize, boardRect });
  const renderer = createRenderer(state, () => currentTileMode, fx);

  const panel = initSettingsPanel({ onOpen: () => syncThemePicker() });

  function buildAnimPicker() {
    renderPickList($('#animPicker'), ANIMS, currentAnim, (id) => {
      currentAnim = id;
      buildAnimPicker();
    });
  }

  function buildTilePicker() {
    renderPickList($('#tilePicker'), TILE_MODES, currentTileMode, (id) => {
      currentTileMode = id;
      buildTilePicker();
      renderer.renderInstant();
    });
  }

  function checkWin() {
    const topVal = highestTile(state.grid);
    for (const ms of WIN_MILESTONES) {
      if (topVal >= ms && !state.wonAcked.has(ms)) {
        state.gameWon = true;
        showBanner(state, true, ms);
        return;
      }
    }
  }

  function doMove(dir) {
    if (state.busy || state.gameOver) return;
    const result = computeMove(state.grid, dir);
    if (!result) return;
    state.busy = true;
    rememberForUndo(state);
    $('#undoBtn').disabled = false;
    addScore(state, result.gained);
    updateUI(state);
    const nextGrid = result.newGrid;
    const sp = spawnTile(nextGrid, Math.random, nextIdFor(state));
    renderer.animateMove(result.moves, nextGrid, sp, currentAnim, () => {
      if (!state.gameWon) checkWin();
      if (!hasMoves(state.grid)) showBanner(state, false);
      persist(state);
    });
  }

  function newGame() {
    fx.kill();
    resetState(state);
    updateUI(state);
    hideBanner();
    renderer.renderInstant();
    $('#undoBtn').disabled = true;
  }

  function doUndo() {
    if (!undo(state)) return;
    hideBanner();
    updateUI(state);
    renderer.renderInstant();
    $('#undoBtn').disabled = true;
  }

  function keepGoing() {
    const ms = parseInt($('#keepGoingBtn').dataset.milestone);
    if (ms) state.wonAcked.add(ms);
    state.gameWon = false;
    hideBanner();
  }

  $('#newGameBtn').addEventListener('click', newGame);
  $('#bannerNewBtn').addEventListener('click', newGame);
  $('#undoBtn').addEventListener('click', doUndo);
  $('#keepGoingBtn').addEventListener('click', keepGoing);

  attachInput({ doMove, panel });
  window.addEventListener('resize', () => {
    fx.resize();
    renderer.renderInstant();
  });

  buildBg();
  buildAnimPicker();
  buildTilePicker();
  fx.resize();
  if (restore(state)) {
    updateUI(state);
    hideBanner();
    renderer.renderInstant();
    $('#undoBtn').disabled = true;
  } else {
    newGame();
  }
}
