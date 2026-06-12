/* Merge-effect launchers + the ANIMS registry. The fx engine is created
   with the canvas and a geometry adapter so it stays game-agnostic. */

import {
  DotParticle,
  SquareParticle,
  EmberParticle,
  Fireball,
  ShockWave,
  SmokeParticle,
  NeonRing,
  StarParticle,
  ShardParticle,
} from './particles.js';

export const ANIMS = [
  { id: 'clean', icon: '✨', label: 'Clean', tileClass: 'tile-merged' },
  { id: 'neon', icon: '⚡', label: 'Neon Pulse', tileClass: 'tile-merged' },
  { id: 'confetti', icon: '🎊', label: 'Confetti', tileClass: 'tile-merged' },
  { id: 'galaxy', icon: '🌌', label: 'Galaxy', tileClass: 'tile-merged' },
  { id: 'glitch', icon: '👾', label: 'Glitch', tileClass: 'tile-glitch' },
  { id: 'shatter', icon: '💥', label: 'Shatter', tileClass: 'tile-shatter' },
  { id: 'inferno', icon: '🔥', label: 'INFERNO', tileClass: 'tile-merged' },
];

export const TILE_COLORS = {
  2: ['#3d3a52', '#9b97b8'],
  4: ['#4a3d6e', '#b89fe8'],
  8: ['#5c3a8a', '#d4aaff'],
  16: ['#6b3fa0', '#e8c0ff'],
  32: ['#7c44b8', '#f0d4ff'],
  64: ['#8b2fc9', '#fff'],
  128: ['#a020f0', '#fff'],
  256: ['#b030e0', '#fff'],
  512: ['#c040d0', '#fff'],
  1024: ['#d050c0', '#fff'],
  2048: ['#e060b0', '#fff'],
};

const rand = (a, b) => a + Math.random() * (b - a);
const randColor = (arr) => arr[Math.floor(Math.random() * arr.length)];

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ tileCentre(r, c): {x, y}, cellSize(): number, boardRect(): DOMRect }} geometry
 */
export function createFx(canvas, geometry) {
  const ctx = canvas.getContext('2d');
  let particles = [];
  let raf = null;

  function resize() {
    const r = geometry.boardRect();
    canvas.width = r.width;
    canvas.height = r.height;
  }

  function loop() {
    // 1. Update all and cull dead ones FIRST
    particles = particles.filter((p) => {
      p.update();
      return p.alive();
    });
    // 2. Clear the canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // 3. Draw only the survivors
    for (const p of particles) p.draw(ctx);
    // 4. Continue, or stop with a guaranteed-clean canvas
    if (particles.length > 0) {
      raf = requestAnimationFrame(loop);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      raf = null;
    }
  }

  function start() {
    if (!raf) raf = requestAnimationFrame(loop);
  }

  /** Single implementation of the lingering-particle cleanup. */
  function kill() {
    particles = [];
    if (raf) {
      cancelAnimationFrame(raf);
      raf = null;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function fxNeon(x, y, sz, col) {
    const colors = [col, '#c084fc', '#7c6af7', '#fff'];
    for (let i = 0; i < 3; i++)
      particles.push(new NeonRing(x, y, sz * (0.6 + i * 0.5), randColor(colors)));
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rand(1, 4);
      particles.push(
        new DotParticle(
          x,
          y,
          Math.cos(a) * sp,
          Math.sin(a) * sp,
          rand(14, 22),
          randColor(colors),
          rand(2, 5),
        ),
      );
    }
  }

  function fxConfetti(x, y) {
    const colors = [
      '#f43f5e',
      '#f97316',
      '#eab308',
      '#22c55e',
      '#3b82f6',
      '#a855f7',
      '#ec4899',
      '#fff',
    ];
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rand(2, 7);
      particles.push(
        new SquareParticle(
          x,
          y,
          Math.cos(a) * sp,
          Math.sin(a) * sp - 2,
          rand(22, 32),
          randColor(colors),
          rand(4, 9),
          Math.random() * Math.PI * 2,
          (Math.random() - 0.5) * 0.25,
        ),
      );
    }
  }

  function fxGalaxy(x, y, col) {
    const colors = [col, '#c084fc', '#7c6af7', '#e8c0ff', '#fff', '#d4aaff'];
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rand(1, 5);
      particles.push(
        new StarParticle(
          x,
          y,
          Math.cos(a) * sp,
          Math.sin(a) * sp - 1,
          rand(20, 32),
          randColor(colors),
          rand(3, 8),
          rand(4, 6),
        ),
      );
    }
    for (let i = 0; i < 20; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rand(0.5, 3);
      particles.push(
        new DotParticle(
          x,
          y,
          Math.cos(a) * sp,
          Math.sin(a) * sp,
          rand(18, 28),
          randColor(colors),
          rand(1, 3),
        ),
      );
    }
  }

  function fxShatter(x, y, sz, col) {
    const lighter = col + 'cc';
    for (let i = 0; i < 20; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rand(2, 8);
      particles.push(
        new ShardParticle(
          x,
          y,
          Math.cos(a) * sp,
          Math.sin(a) * sp - 1,
          rand(18, 28),
          i % 3 === 0 ? '#fff' : lighter,
          rand(sz * 0.06, sz * 0.18),
        ),
      );
    }
    particles.push(new NeonRing(x, y, sz * 0.8, '#fff'));
  }

  function fxInferno(x, y, sz) {
    particles.push(new Fireball(x, y, sz * 2.2));
    particles.push(new Fireball(x, y, sz * 1.5));
    particles.push(new ShockWave(x, y, sz * 3.5));
    particles.push(new ShockWave(x, y, sz * 2.5));
    const emberColors = ['#ff4400', '#ff7700', '#ffaa00', '#ffee00', '#fff'];
    for (let i = 0; i < 80; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rand(1, 9);
      particles.push(
        new EmberParticle(
          x + rand(-sz * 0.3, sz * 0.3),
          y + rand(-sz * 0.3, sz * 0.3),
          Math.cos(a) * sp,
          Math.sin(a) * sp - rand(1, 4),
          rand(20, 32),
          randColor(emberColors),
        ),
      );
    }
    for (let i = 0; i < 12; i++) {
      particles.push(
        new SmokeParticle(
          x + rand(-sz * 0.5, sz * 0.5),
          y + rand(-sz * 0.3, sz * 0.3),
          rand(-0.5, 0.5),
          rand(-2, -0.5),
          rand(25, 32),
        ),
      );
    }
    for (let i = 0; i < 25; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rand(4, 14);
      particles.push(
        new DotParticle(
          x,
          y,
          Math.cos(a) * sp,
          Math.sin(a) * sp - 2,
          rand(12, 22),
          randColor(emberColors),
          rand(1, 3),
        ),
      );
    }
  }

  function spawnFx(animId, r, c, val) {
    resize();
    const { x, y } = geometry.tileCentre(r, c);
    const sz = geometry.cellSize();
    const col = (TILE_COLORS[val] || TILE_COLORS[2048])[0];

    switch (animId) {
      case 'neon':
        fxNeon(x, y, sz, col);
        break;
      case 'confetti':
        fxConfetti(x, y);
        break;
      case 'galaxy':
        fxGalaxy(x, y, col);
        break;
      case 'glitch':
        /* tile CSS handles it */ break;
      case 'shatter':
        fxShatter(x, y, sz, col);
        break;
      case 'inferno':
        fxInferno(x, y, sz);
        break;
      default:
        break; // clean — no particles
    }
    start();
  }

  return { spawnFx, kill, resize };
}
