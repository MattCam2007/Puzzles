/* Kakuro rendering: board, numpad, combinations sheet. */

import { $, el } from '../../core/dom.js';
import { renderNumpad as renderPad } from '../../ui/numpad.js';
import { segments, candidates, combos } from './engine.js';

export function sizeBoard(game) {
  const { G } = game;
  const wrap = document.querySelector('.board-wrap');
  const avail = wrap.clientWidth;
  const chrome = (G.C - 1) * 2 + 4 + 4;
  const cell = Math.floor((avail - chrome) / G.C);
  const clamped = Math.max(28, Math.min(70, cell));
  document.documentElement.style.setProperty('--cell', clamped + 'px');
  const boardEl = $('#board');
  boardEl.style.gridTemplateColumns = 'repeat(' + G.C + ', 1fr)';
  boardEl.style.gridTemplateRows = 'repeat(' + G.R + ', 1fr)';
}

/**
 * @param {object} game
 * @param {object} settings
 * @param {{ onSelect(r, c): void, onClueTap(r, c, dir): void }} handlers
 */
export function render(game, settings, handlers) {
  const { G } = game;
  const boardEl = $('#board');
  boardEl.innerHTML = '';

  const runSet = new Set();
  const pencilHlSet = new Set();
  if (game.sel && (settings.runs || settings.highlightPencil)) {
    const { H, V } = segments(G.board, G.R, G.C);
    const selVal = game.entries[game.sel.r][game.sel.c];
    for (const s of [...H, ...V]) {
      if (s.some(([r, c]) => r === game.sel.r && c === game.sel.c)) {
        for (const [r, c] of s) {
          if (settings.runs) runSet.add(r + ',' + c);
          if (
            settings.highlightPencil &&
            selVal &&
            !(r === game.sel.r && c === game.sel.c) &&
            game.notes[r][c].has(selVal)
          ) {
            pencilHlSet.add(r + ',' + c);
          }
        }
      }
    }
  }

  for (let r = 0; r < G.R; r++) {
    for (let c = 0; c < G.C; c++) {
      const d = document.createElement('div');
      d.className = 'cell';
      if (!G.board[r][c]) {
        const q = G.clues[r][c];
        if (q && (q.right || q.down)) {
          d.className = 'cell clue';
          if (q.down) d.appendChild(el('span', { className: 'down' }, q.down));
          if (q.right) d.appendChild(el('span', { className: 'right' }, q.right));
          d.classList.add('tappable');
          d.addEventListener('click', (ev) => {
            let dir;
            if (q.right && !q.down) dir = 'right';
            else if (q.down && !q.right) dir = 'down';
            else {
              const rect = d.getBoundingClientRect();
              const x = (ev.clientX - rect.left) / rect.width;
              const y = (ev.clientY - rect.top) / rect.height;
              dir = x >= y ? 'right' : 'down';
            }
            handlers.onClueTap(r, c, dir);
          });
        } else {
          d.className = 'cell block';
        }
      } else {
        d.className = 'cell white';
        d.tabIndex = 0;
        d.dataset.r = r;
        d.dataset.c = c;
        const v = game.entries[r][c];
        if (v) {
          d.appendChild(el('span', { className: 'big' }, v));
        } else if (game.notes[r][c] && game.notes[r][c].size) {
          const n = el('div', { className: 'notes' });
          for (let k = 1; k <= 9; k++) {
            n.appendChild(el('span', {}, game.notes[r][c].has(k) ? k : ''));
          }
          d.appendChild(n);
        }
        if (runSet.has(r + ',' + c)) d.classList.add('run');
        if (pencilHlSet.has(r + ',' + c)) d.classList.add('pencil-hl');
        if (game.sel && game.sel.r === r && game.sel.c === c) d.classList.add('sel');
        if (game.errFlags && game.errFlags[r][c]) d.classList.add('err');
        if (game.hintedCell && game.hintedCell.r === r && game.hintedCell.c === c)
          d.classList.add('hinted');
        d.addEventListener('click', () => handlers.onSelect(r, c));
      }
      boardEl.appendChild(d);
    }
  }
}

export function renderNumpad(game, settings, onTap) {
  let cand = null;
  if (game.sel && settings.dimpad && !game.entries[game.sel.r][game.sel.c]) {
    const cmap = candidates(game.G.board, game.G.clues, game.G.R, game.G.C, game.entries);
    cand = cmap[game.sel.r + ',' + game.sel.c] || [];
  }
  renderPad($('#numpad'), {
    onTap,
    decorate: (btn, n) => {
      if (cand && !cand.includes(n)) btn.classList.add('dim');
    },
  });
}

export function syncNotesBtn(game) {
  const btn = $('#notesBtn');
  if (!btn) return;
  btn.textContent = game.notesMode ? '🔹 Notes' : '✏️ Normal';
  btn.classList.toggle('active', game.notesMode);
}

export function flashSelected() {
  const sel = $('#board').querySelector('.cell.white.sel');
  if (sel) sel.classList.add('flash');
}

function runCells(game, r, c, dir) {
  const { G } = game;
  const cells = [];
  if (dir === 'right') {
    let cc = c + 1;
    while (cc < G.C && G.board[r][cc]) {
      cells.push([r, cc]);
      cc++;
    }
  } else {
    let rr = r + 1;
    while (rr < G.R && G.board[rr][c]) {
      cells.push([rr, c]);
      rr++;
    }
  }
  return cells;
}

export function showCombos(game, r, c, dir) {
  const q = game.G.clues[r][c];
  if (!q) return;
  const sum = dir === 'right' ? q.right : q.down;
  if (!sum) return;
  const cells = runCells(game, r, c, dir);
  const len = cells.length;
  const placed = [];
  for (const [rr, cc] of cells) if (game.entries[rr][cc]) placed.push(game.entries[rr][cc]);
  let placedMask = 0;
  for (const d of placed) placedMask |= 1 << d;
  const dupPlaced = placed.length !== new Set(placed).size;
  const masks = combos(len, sum);
  const rows = masks.map((m) => {
    const digits = [];
    for (let d = 1; d <= 9; d++) if (m & (1 << d)) digits.push(d);
    const compatible = !dupPlaced && (m & placedMask) === placedMask;
    return { digits, mask: m, compatible };
  });
  let forced = 0b1111111110;
  let anyCompat = false;
  for (const row of rows)
    if (row.compatible) {
      forced &= row.mask;
      anyCompat = true;
    }
  if (!anyCompat) forced = 0;
  const forcedDigits = [];
  for (let d = 1; d <= 9; d++) if (forced & (1 << d)) forcedDigits.push(d);

  $('#comboTitle').textContent = (dir === 'right' ? 'Across' : 'Down') + ' · sum ' + sum;
  const compatCount = rows.filter((x) => x.compatible).length;
  const meta =
    masks.length === 1
      ? len + ' cells · only one way'
      : len +
        ' cells · ' +
        masks.length +
        ' combinations' +
        (placed.length && !dupPlaced && compatCount < masks.length
          ? ' · ' + compatCount + ' still possible'
          : '');
  $('#comboMeta').textContent = meta;

  const fc = $('#comboForced');
  fc.innerHTML = '';
  const list = $('#comboList');
  list.innerHTML = '';

  if (masks.length === 0) {
    list.appendChild(
      el(
        'div',
        { className: 'combo-empty' },
        'No combination of ' + len + ' distinct digits sums to ' + sum + '.',
      ),
    );
  } else if (masks.length === 1) {
    const rd = el('div', { className: 'combo-row' });
    for (const d of rows[0].digits) {
      const ch = el('span', { className: 'chip' }, d);
      if (placedMask & (1 << d)) ch.classList.add('placed');
      else ch.classList.add('forced');
      rd.appendChild(ch);
    }
    list.appendChild(rd);
  } else {
    if (forcedDigits.length) {
      fc.appendChild(el('span', { className: 'lab' }, 'Always in'));
      for (const d of forcedDigits) fc.appendChild(el('span', { className: 'chip sm forced' }, d));
    }
    rows.sort((a, b) => b.compatible - a.compatible || a.digits[0] - b.digits[0]);
    for (const row of rows) {
      const rd = el('div', { className: 'combo-row' + (row.compatible ? '' : ' dim') });
      for (const d of row.digits) {
        const ch = el('span', { className: 'chip' }, d);
        if (row.compatible && placedMask & (1 << d)) ch.classList.add('placed');
        else if (row.compatible && forced & (1 << d)) ch.classList.add('forced');
        rd.appendChild(ch);
      }
      list.appendChild(rd);
    }
  }
  $('#comboSheet').classList.add('show');
}
