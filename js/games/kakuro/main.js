/* Kakuro composition root. */

import { $ } from '../../core/dom.js';
import { formatTime, createTicker } from '../../core/time.js';
import { STORAGE_KEYS } from '../../core/storage.js';
import { initSettingsPanel } from '../../ui/settings-panel.js';
import { createToast } from '../../ui/toast.js';
import { syncThemePicker } from '../../theme/theme-picker.js';
import { hint, evaluate } from './engine.js';
import {
  loadSettings,
  createGame,
  restoreGame,
  persist,
  clearSaved,
  inputDigit,
  eraseSelected,
  clearEntries,
  refreshEvaluation,
  moveSelection,
} from './state.js';
import {
  render,
  renderNumpad,
  syncNotesBtn,
  sizeBoard,
  flashSelected,
  showCombos,
} from './render.js';
import { attachKeyboard } from './input.js';
import { initSettings, syncSettingsUI } from './settings.js';

export function boot() {
  const settings = loadSettings();
  let game = null;

  const toast = createToast($('#toast'));

  const ticker = createTicker(() => {
    if (!game.won) {
      game.timer++;
      $('#timer').textContent = formatTime(game.timer);
    }
  });

  function startTimer() {
    ticker.stop();
    if (settings.timer) ticker.start();
  }

  const panel = initSettingsPanel({
    onOpen: () => {
      syncSettingsUI(settings);
      syncThemePicker();
    },
  });

  const handlers = {
    onSelect: (r, c) => {
      game.sel = { r, c };
      game.hintedCell = null;
      refresh();
    },
    onClueTap: (r, c, dir) => showCombos(game, r, c, dir),
  };

  function refresh() {
    render(game, settings, handlers);
    renderNumpad(game, settings, onDigit);
    syncNotesBtn(game);
  }

  function afterChange(flash) {
    if (settings.autocheck) {
      refreshEvaluation(game, settings);
    } else {
      game.errFlags = null;
    }
    refresh();
    if (flash) flashSelected();
    persist(game);
    checkWin();
  }

  function checkWin() {
    const ev = evaluate(game.G.board, game.G.clues, game.G.R, game.G.C, game.entries);
    if (ev.complete) doWin();
  }

  function doWin() {
    game.won = true;
    ticker.stop();
    const msgs = [
      'Every run sums true.',
      'Clean grid. No contradictions.',
      'Cross-sums all balanced.',
    ];
    $('#overlayTitle').textContent = 'Grid Solved!';
    $('#overlayMsg').textContent =
      msgs[Math.floor(Math.random() * msgs.length)] +
      ' Finished in ' +
      formatTime(game.timer) +
      '.';
    $('#overlay').classList.add('show');
    clearSaved();
  }

  function onDigit(n) {
    const ev = inputDigit(game, settings, n);
    if (ev.type === 'noop') return;
    afterChange(!!ev.flash);
  }

  function syncControls() {
    $('#sizeVal').textContent = game.size + '×' + game.size;
    $('#sizeDown').disabled = game.size <= 5;
    $('#sizeUp').disabled = game.size >= 12;
  }

  function newGame(size) {
    const level = $('#difficultySelect').value;
    const curSize = size !== undefined ? size : game ? game.size : 5;
    toast('Building a fresh grid…', 'cyan', 700);
    // generation runs after the toast paints (worker offload is planned in
    // plans/refactor-and-testing.md Phase 8)
    setTimeout(() => {
      const seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0;
      game = createGame(level, curSize, seed);
      $('#timer').textContent = settings.timer ? '0:00' : '—';
      syncControls();
      sizeBoard(game);
      refresh();
      startTimer();
      persist(game);
    }, 20);
  }

  function doHint() {
    if (game.won) return;
    const target = game.sel && !game.entries[game.sel.r][game.sel.c] ? game.sel : null;
    const res = hint(game.G.board, game.G.clues, game.G.R, game.G.C, game.entries, target);
    if (!res) {
      toast('Grid is already full.', 'cyan');
      return;
    }
    if (res.conflict) {
      toast('Current entries conflict — nothing fits. Try clearing some cells.', 'coral', 2200);
      return;
    }
    game.entries[res.r][res.c] = res.val;
    game.notes[res.r][res.c].clear();
    game.sel = { r: res.r, c: res.c };
    game.hintedCell = { r: res.r, c: res.c };
    afterChange(true);
    toast('Placed ' + res.val + ' — one cell logic guarantees.', 'cyan', 1400);
  }

  function eraseCell() {
    const ev = eraseSelected(game);
    if (ev.type === 'noop') return;
    afterChange(false);
  }

  function toggleNotes() {
    game.notesMode = !game.notesMode;
    syncNotesBtn(game);
    renderNumpad(game, settings, onDigit);
  }

  function restore() {
    const restored = restoreGame();
    if (!restored) return false;
    game = restored;
    $('#timer').textContent = settings.timer ? formatTime(game.timer) : '—';
    $('#difficultySelect').value = game.level;
    syncControls();
    sizeBoard(game);
    refresh();
    startTimer();
    return true;
  }

  /* wire up */
  $('#newGameBtn').addEventListener('click', () => newGame());
  $('#sizeDown').addEventListener('click', () => {
    if (game.size > 5) newGame(game.size - 1);
  });
  $('#sizeUp').addEventListener('click', () => {
    if (game.size < 12) newGame(game.size + 1);
  });
  $('#hintBtn').addEventListener('click', doHint);
  $('#clearBtn').addEventListener('click', () => {
    const ev = clearEntries(game);
    if (ev.type === 'noop') return;
    refresh();
    persist(game);
  });
  $('#eraseBtn').addEventListener('click', eraseCell);
  $('#notesBtn').addEventListener('click', toggleNotes);
  $('#overlayBtn').addEventListener('click', () => {
    $('#overlay').classList.remove('show');
    newGame();
  });
  $('#overlay').addEventListener('click', (e) => {
    if (e.target === $('#overlay')) $('#overlay').classList.remove('show');
  });
  $('#closeCombo').addEventListener('click', () => $('#comboSheet').classList.remove('show'));
  $('#comboSheet').addEventListener('click', (e) => {
    if (e.target === $('#comboSheet')) $('#comboSheet').classList.remove('show');
  });

  initSettings(settings, {
    autocheck: () => {
      refreshEvaluation(game, settings);
      refresh();
    },
    runs: refresh,
    highlightPencil: refresh,
    dimpad: () => renderNumpad(game, settings, onDigit),
    timer: () => {
      if (settings.timer) {
        startTimer();
      } else {
        ticker.stop();
        $('#timer').textContent = '—';
      }
    },
  });

  attachKeyboard({
    panel,
    onDigit,
    onErase: eraseCell,
    toggleNotes,
    onHint: doHint,
    onMove: (key) => {
      if (game.sel && moveSelection(game, key)) refresh();
    },
    onOverlayEnter: () => {
      $('#overlay').classList.remove('show');
      newGame();
    },
  });

  window.addEventListener('resize', () => {
    if (game) sizeBoard(game);
  });

  /* boot */
  syncSettingsUI(settings);
  if (!restore()) newGame(5);
  else if (!settings.timer) $('#timer').textContent = '—';
  try {
    if (!localStorage.getItem(STORAGE_KEYS.kakuroTip)) {
      setTimeout(() => {
        toast('Tip: tap any clue number to see its possible combinations.', 'cyan', 3600);
        localStorage.setItem(STORAGE_KEYS.kakuroTip, '1');
      }, 1400);
    }
  } catch {
    /* storage unavailable — skip the tip */
  }
}
