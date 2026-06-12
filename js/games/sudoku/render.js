/* Sudoku rendering — pure state → DOM. */

import { $, $$, el } from '../../core/dom.js';
import { renderNumpad as renderPad } from '../../ui/numpad.js';
import { isLegalPlacement } from './engine.js';

export function renderBoard(game, cfg, onCellTap) {
  const board = $('#board');
  board.innerHTML = '';
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const cell = el('div', { className: 'cell', dataset: { row: r, col: c } });
      const isGiven = game.puzzle[r][c] !== 0;
      const pv = game.playerBoard[r][c];
      const marks = game.pencilMarks[r][c];

      if (isGiven) {
        cell.classList.add('given');
        cell.textContent = game.puzzle[r][c];
      } else if (pv !== 0) {
        cell.textContent = pv;
        if (cfg.checkMistakes && pv !== game.solution[r][c]) cell.classList.add('error');
      } else if (marks.size > 0) {
        const grid = el('div', { className: 'pencil-grid' });
        for (let n = 1; n <= 9; n++) {
          grid.appendChild(
            el('div', { className: 'pencil-mark' + (marks.has(n) ? ' visible' : '') }, n),
          );
        }
        cell.appendChild(grid);
      }
      cell.addEventListener('pointerdown', () => onCellTap(r, c));
      board.appendChild(cell);
    }
  }
  applyHighlights(game, cfg);
}

export function applyHighlights(game, cfg) {
  const cells = $$('.cell');
  cells.forEach((cell) => {
    cell.classList.remove(
      'selected',
      'numfirst-selected',
      'box-hl',
      'line-hl',
      'same-number',
      'candidate',
      'excluded',
      'pencil-hl',
    );
  });

  if (cfg.inputMode === 'cell' && game.selected) {
    const [sr, sc] = game.selected;
    const selVal = game.playerBoard[sr][sc] || game.puzzle[sr][sc];
    const boxR = Math.floor(sr / 3) * 3;
    const boxC = Math.floor(sc / 3) * 3;
    cells.forEach((cell) => {
      const r = +cell.dataset.row;
      const c = +cell.dataset.col;
      if (r === sr && c === sc) {
        cell.classList.add('selected');
        return;
      }
      if (cfg.highlight) {
        const inBox = r >= boxR && r < boxR + 3 && c >= boxC && c < boxC + 3;
        if (inBox) cell.classList.add('box-hl');
        else if (r === sr || c === sc) cell.classList.add('line-hl');
      }
      if (cfg.sameNum && selVal) {
        const cv = game.playerBoard[r][c] || game.puzzle[r][c];
        if (cv === selVal) cell.classList.add('same-number');
        else if (
          cfg.highlightPencil &&
          game.puzzle[r][c] === 0 &&
          game.playerBoard[r][c] === 0 &&
          game.pencilMarks[r][c].has(selVal)
        ) {
          cell.classList.add('pencil-hl');
        }
      }
    });
  }

  if (cfg.inputMode === 'number' && game.selectedNum) {
    cells.forEach((cell) => {
      const r = +cell.dataset.row;
      const c = +cell.dataset.col;
      const cv = game.playerBoard[r][c] || game.puzzle[r][c];
      const empty = game.puzzle[r][c] === 0 && game.playerBoard[r][c] === 0;
      // highlight existing placements of this number
      if (cfg.sameNum && cv === game.selectedNum) cell.classList.add('numfirst-selected');
      else if (cfg.highlightPencil && empty && game.pencilMarks[r][c].has(game.selectedNum)) {
        cell.classList.add('pencil-hl');
      }
      // candidate cells: empty, no conflict; excluded: empty, has a conflict
      if (cfg.showCandidates || cfg.showExcluded) {
        const legal =
          empty && isLegalPlacement(game.puzzle, game.playerBoard, r, c, game.selectedNum);
        if (cfg.showCandidates && empty && legal) cell.classList.add('candidate');
        if (cfg.showExcluded && empty && !legal) cell.classList.add('excluded');
      }
    });
  }
}

export function renderNumpad(game, cfg, onNumTap) {
  const counts = Array(10).fill(0);
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++) {
      const v = game.playerBoard[r][c] || game.puzzle[r][c];
      if (v) counts[v]++;
    }
  renderPad($('#numpad'), {
    onTap: onNumTap,
    decorate: (btn, n) => {
      if (cfg.inputMode === 'number' && game.selectedNum === n) btn.classList.add('num-selected');
      btn.appendChild(el('span', { className: 'count-badge' }, counts[n] > 0 ? counts[n] : ''));
      if (counts[n] >= 9) btn.classList.add('completed-num');
    },
  });
}

/** Lives dots — rendered from the configured strike limit (capped at 10). */
export function updateMistakeDots(game, cfg) {
  const wrap = $('#mistakesDots');
  if (!wrap) return;
  wrap.innerHTML = '';
  const lim = Math.min(cfg.strikeLimit, 10);
  for (let i = 1; i <= lim; i++) {
    wrap.appendChild(el('div', { className: 'mistake-dot' + (i <= game.mistakes ? ' used' : '') }));
  }
}

export function syncPencilBtn(game) {
  const btn = $('#notesBtn');
  btn.textContent = game.pencilMode ? '🔹 Pencil' : '✏️ Normal';
  btn.classList.toggle('active', game.pencilMode);
}

export function applySettingsToUI(game, cfg) {
  // mode toggle button
  const modeBtn = $('#modeToggleBtn');
  if (cfg.inputMode === 'number') {
    modeBtn.textContent = 'Num First';
    modeBtn.classList.add('mode-numfirst');
  } else {
    modeBtn.textContent = 'Cell First';
    modeBtn.classList.remove('mode-numfirst');
  }

  syncPencilBtn(game);

  // mistakes dots visibility (hidden when unlimited — there is nothing to count down)
  $('#mistakesWrap').style.display =
    cfg.showMistakeDots && cfg.checkMistakes && cfg.strikeLimit > 0 ? 'flex' : 'none';

  // hints button
  $('#hintBtn').classList.toggle('hidden', !cfg.showHints);

  // numpad visibility
  $('#numpad').style.display = cfg.showNumpad ? 'grid' : 'none';

  // strike rows in settings
  const needsStrikes = cfg.checkMistakes;
  $('#mistakeDotsRow').style.opacity = needsStrikes ? '1' : '0.4';
  $('#strikeRow').style.opacity = needsStrikes ? '1' : '0.4';
  $('#strikePicker').style.opacity = needsStrikes ? '1' : '0.4';
}

export function updateCellSize() {
  const wrap = document.querySelector('.board-wrap');
  if (!wrap) return;
  const avail = wrap.clientWidth;
  const cell = Math.floor((avail - 8 * 1 - 4) / 9); // 8 one-px gaps + 2px border each side
  document.documentElement.style.setProperty('--cell', Math.max(30, cell) + 'px');
}
