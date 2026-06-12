/* 2048 rendering: tiles, slide animation orchestration, bg grid, banner. */

import { $ } from '../../core/dom.js';
import { N } from './engine.js';
import { tileLabel } from './tile-modes.js';
import { ANIMS, TILE_COLORS } from './fx/effects.js';

export const PAD = 11;
export const GAP = 9;
export const SLIDE = 55;

export function cellSize() {
  const w = $('#tc').getBoundingClientRect().width;
  return (w - GAP * (N - 1)) / N;
}

export function cellXY(r, c) {
  const sz = cellSize();
  return { x: c * (sz + GAP), y: r * (sz + GAP) };
}

/** Canvas coords of a tile centre (the fx layer's geometry adapter). */
export function tileCentre(r, c) {
  const sz = cellSize();
  return { x: PAD + c * (sz + GAP) + sz / 2, y: PAD + r * (sz + GAP) + sz / 2 };
}

export function boardRect() {
  return $('.board-wrap').getBoundingClientRect();
}

export function buildBg() {
  const bg = $('#bgGrid');
  bg.innerHTML = '';
  for (let i = 0; i < N * N; i++) {
    const d = document.createElement('div');
    d.className = 'bg-cell';
    bg.appendChild(d);
  }
}

function makeTileEl(id, val, r, c, tileMode) {
  const sz = cellSize();
  const { x, y } = cellXY(r, c);
  const { text, cls, glow } = tileLabel(val, tileMode);

  // Font size: depends on mode and text length
  let fs;
  if (cls === 'tile-mode-greek' || cls === 'tile-mode-occult' || cls === 'tile-mode-emoji') {
    fs = '1.6rem';
  } else {
    const len = text.length;
    fs = len <= 2 ? '2rem' : len <= 4 ? '1.6rem' : len <= 6 ? '1.1rem' : '0.78rem';
  }

  const vClass = TILE_COLORS[val] ? `tile-v${val}` : 'tile-vmax';
  const el = document.createElement('div');
  el.className = 'tile ' + vClass + (cls ? ' ' + cls : '') + (glow ? ' tile-occult-glow' : '');
  el.dataset.tid = id;
  el.textContent = text;
  el.style.cssText = `width:${sz}px;height:${sz}px;font-size:${fs};--tx:translate(${x}px,${y}px);transform:translate(${x}px,${y}px);`;
  return el;
}

/**
 * Renderer with its own element map (tile id → DOM node), which the slide
 * animation relies on.
 */
export function createRenderer(state, getTileMode, fx) {
  let elMap = {};

  function renderInstant(spawnPos) {
    const tc = $('#tc');
    tc.innerHTML = '';
    elMap = {};
    for (let r = 0; r < N; r++)
      for (let c = 0; c < N; c++) {
        const cell = state.grid[r][c];
        if (!cell) continue;
        const el = makeTileEl(cell.id, cell.val, r, c, getTileMode());
        if (spawnPos && spawnPos[0] === r && spawnPos[1] === c) {
          el.classList.add('tile-new');
        }
        tc.appendChild(el);
        elMap[cell.id] = el;
      }
  }

  function animateMove(moves, newGrid, spawnPos, currentAnim, onDone) {
    fx.kill(); // clear any lingering particles from previous move
    const anim = ANIMS.find((a) => a.id === currentAnim);
    const easing = 'cubic-bezier(0.25,0,0.25,1)';

    const mergeDests = [];
    for (const m of moves) {
      if (!m.absorbed && m.mergedVal) {
        mergeDests.push({ r: m.toR, c: m.toC, val: m.mergedVal });
      }
    }

    const animations = moves
      .map((m) => {
        const el = elMap[m.id];
        if (!el) return null;
        const from = cellXY(m.fromR, m.fromC);
        const to = cellXY(m.toR, m.toC);
        el.style.zIndex = m.absorbed ? '1' : '2';
        // fill:'none' — we handle final position ourselves in renderInstant
        return el.animate(
          [
            { transform: `translate(${from.x}px,${from.y}px)` },
            { transform: `translate(${to.x}px,${to.y}px)` },
          ],
          { duration: SLIDE, easing, fill: 'none' },
        );
      })
      .filter(Boolean);

    Promise.all(animations.map((a) => a.finished)).then(() => {
      state.grid = newGrid;
      renderInstant(spawnPos);

      // Add merge class (auto-removed when the CSS animation ends) + particles
      for (const { r, c, val } of mergeDests) {
        const el = elMap[state.grid[r][c]?.id];
        if (el) {
          el.classList.add(anim.tileClass);
          fx.spawnFx(currentAnim, r, c, val);
        }
      }

      state.busy = false;
      onDone();
    });
  }

  return { renderInstant, animateMove };
}

export function updateUI(state) {
  $('#score').textContent = state.score.toLocaleString();
  $('#best').textContent = state.best.toLocaleString();
}

export function showBanner(state, won, milestone) {
  $('#bannerTitle').textContent = won
    ? milestone === 4096
      ? 'You got 4096! 🔥'
      : 'You win! 🎉'
    : 'Game Over';
  $('#bannerSub').textContent = won ? `Score: ${state.score.toLocaleString()}` : 'No moves left';
  $('#keepGoingBtn').style.display = won ? 'block' : 'none';
  $('#keepGoingBtn').dataset.milestone = milestone || '';
  $('#banner').classList.add('show');
  state.gameOver = !won;
}

export function hideBanner() {
  $('#banner').classList.remove('show');
}
