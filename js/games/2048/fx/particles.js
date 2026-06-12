/* Canvas particle classes — drawing only, no game knowledge. */

export class Particle {
  constructor(x, y, vx, vy, life, color, size) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.life = life;
    this.maxLife = life;
    this.color = color;
    this.size = size;
  }
  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.life--;
  }
  alive() {
    return this.life > 0;
  }
  alpha() {
    return this.life / this.maxLife;
  }
}

export class DotParticle extends Particle {
  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = this.alpha();
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

export class SquareParticle extends Particle {
  constructor(x, y, vx, vy, life, color, size, rot, rotV) {
    super(x, y, vx, vy, life, color, size);
    this.rot = rot;
    this.rotV = rotV;
  }
  update() {
    super.update();
    this.vy += 0.12;
    this.rot += this.rotV;
  }
  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = this.alpha();
    ctx.fillStyle = this.color;
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    ctx.fillRect(-this.size / 2, -this.size / 2, this.size, this.size);
    ctx.restore();
  }
}

export class EmberParticle extends Particle {
  constructor(x, y, vx, vy, life, color) {
    super(x, y, vx, vy, life, color, 2);
    this.flicker = Math.random() * Math.PI * 2;
  }
  update() {
    super.update();
    this.vy -= 0.25 + Math.random() * 0.1; // rise
    this.vx += (Math.random() - 0.5) * 0.3;
    this.flicker += 0.3;
    this.size = 1.5 + Math.sin(this.flicker) * 1.2;
  }
  draw(ctx) {
    const a = this.alpha();
    ctx.save();
    ctx.globalAlpha = a;
    const grad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.size * 2);
    grad.addColorStop(0, '#fff');
    grad.addColorStop(0.3, this.color);
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size * 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

export class Fireball extends Particle {
  constructor(x, y, radius) {
    super(x, y, 0, 0, 35, null, radius);
    this.maxRadius = radius;
  }
  update() {
    this.life--;
  }
  draw(ctx) {
    const t = 1 - this.life / this.maxLife;
    const r = this.maxRadius * (0.2 + t * 0.8);
    const a = this.alpha();
    ctx.save();
    ctx.globalAlpha = a * 0.9;
    const grad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, r);
    grad.addColorStop(0, '#fff');
    grad.addColorStop(0.15, '#ffe060');
    grad.addColorStop(0.4, '#ff6600');
    grad.addColorStop(0.7, '#cc1100');
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

export class ShockWave extends Particle {
  constructor(x, y, maxR) {
    super(x, y, 0, 0, 25, null, 0);
    this.maxR = maxR;
  }
  update() {
    this.life--;
  }
  draw(ctx) {
    const t = 1 - this.life / this.maxLife;
    const r = this.maxR * t;
    const a = this.alpha() * 0.8;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.strokeStyle = '#ff9900';
    ctx.lineWidth = 4 * (1 - t) + 1;
    ctx.beginPath();
    ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

export class SmokeParticle extends Particle {
  constructor(x, y, vx, vy, life) {
    super(x, y, vx, vy, life, '#555', 8 + Math.random() * 12);
  }
  update() {
    super.update();
    this.vy -= 0.08;
    this.size += 0.3;
    this.vx += (Math.random() - 0.5) * 0.15;
  }
  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = this.alpha() * 0.25;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

export class NeonRing extends Particle {
  constructor(x, y, maxR, color) {
    super(x, y, 0, 0, 22, color, 0);
    this.maxR = maxR;
  }
  update() {
    this.life--;
  }
  draw(ctx) {
    const t = 1 - this.life / this.maxLife;
    const r = this.maxR * t;
    const a = this.alpha();
    ctx.save();
    ctx.globalAlpha = a;
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 3 * (1 - t) + 0.5;
    ctx.shadowBlur = 12;
    ctx.shadowColor = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

export class StarParticle extends Particle {
  constructor(x, y, vx, vy, life, color, size, points) {
    super(x, y, vx, vy, life, color, size);
    this.points = points || 5;
    this.rot = Math.random() * Math.PI;
    this.rotV = (Math.random() - 0.5) * 0.15;
  }
  update() {
    super.update();
    this.vy -= 0.05;
    this.rot += this.rotV;
  }
  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = this.alpha();
    ctx.fillStyle = this.color;
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    ctx.beginPath();
    const s = this.size;
    const p = this.points;
    for (let i = 0; i < p * 2; i++) {
      const r2 = i % 2 === 0 ? s : s * 0.4;
      const a = (i / p / 2) * Math.PI * 2 - Math.PI / 2;
      if (i === 0) ctx.moveTo(Math.cos(a) * r2, Math.sin(a) * r2);
      else ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

export class ShardParticle extends Particle {
  constructor(x, y, vx, vy, life, color, size) {
    super(x, y, vx, vy, life, color, size);
    this.rot = Math.random() * Math.PI * 2;
    this.rotV = (Math.random() - 0.5) * 0.25;
    this.pts = [];
    const n = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = size * (0.5 + Math.random() * 0.8);
      this.pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
  }
  update() {
    super.update();
    this.vy += 0.18;
    this.rot += this.rotV;
  }
  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = this.alpha();
    ctx.fillStyle = this.color;
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    ctx.beginPath();
    this.pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
