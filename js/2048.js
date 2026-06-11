// ═══════════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════════
const N     = 4;
const PAD   = 11;
const GAP   = 9;
const SLIDE = 55;

const TILE_COLORS = {
  2:    ['#3d3a52','#9b97b8'], 4:    ['#4a3d6e','#b89fe8'],
  8:    ['#5c3a8a','#d4aaff'], 16:   ['#6b3fa0','#e8c0ff'],
  32:   ['#7c44b8','#f0d4ff'], 64:   ['#8b2fc9','#fff'],
  128:  ['#a020f0','#fff'],    256:  ['#b030e0','#fff'],
  512:  ['#c040d0','#fff'],    1024: ['#d050c0','#fff'],
  2048: ['#e060b0','#fff'],
};

// ═══════════════════════════════════════════════════════════
//  ANIMATION SYSTEM
// ═══════════════════════════════════════════════════════════
const ANIMS = [
  { id:'clean',    icon:'✨', label:'Clean',        tileClass:'tile-merged' },
  { id:'neon',     icon:'⚡', label:'Neon Pulse',   tileClass:'tile-merged' },
  { id:'confetti', icon:'🎊', label:'Confetti',     tileClass:'tile-merged' },
  { id:'galaxy',   icon:'🌌', label:'Galaxy',       tileClass:'tile-merged' },
  { id:'glitch',   icon:'👾', label:'Glitch',       tileClass:'tile-glitch' },
  { id:'shatter',  icon:'💥', label:'Shatter',      tileClass:'tile-shatter'},
  { id:'inferno',  icon:'🔥', label:'INFERNO',      tileClass:'tile-merged' },
];

let currentAnim = 'clean';

// ═══════════════════════════════════════════════════════════
//  TILE MODE SYSTEM
// ═══════════════════════════════════════════════════════════
const VALS = [2,4,8,16,32,64,128,256,512,1024,2048,4096];

const TILE_MODES = [
  {
    id:'numbers', icon:'🔢', label:'Numbers',
    render: v => ({ text: String(v), cls: '' }),
  },
  {
    id:'roman', icon:'🏛️', label:'Roman',
    render: v => {
      const map={2:'II',4:'IV',8:'VIII',16:'XVI',32:'XXXII',64:'LXIV',128:'CXXVIII',256:'CCLVI',512:'DXII',1024:'MXX',2048:'MMX',4096:'MVM'};
      return { text: map[v]||String(v), cls: '' };
    },
  },
  {
    id:'hex', icon:'💻', label:'Hex',
    render: v => ({ text: '0x'+v.toString(16).toUpperCase(), cls: '' }),
  },
  {
    id:'binary', icon:'⚙️', label:'Binary',
    render: v => ({ text: v.toString(2), cls: '' }),
  },
  {
    id:'greek', icon:'🔮', label:'Greek',
    render: v => {
      const map={2:'α',4:'β',8:'γ',16:'δ',32:'ε',64:'ζ',128:'η',256:'θ',512:'ι',1024:'λ',2048:'Ω',4096:'∞'};
      return { text: map[v]||'?', cls: 'tile-mode-greek' };
    },
  },
  {
    id:'cursed', icon:'💀', label:'Cursed Emoji',
    render: v => {
      const map={2:'💀',4:'👁️',8:'🤡',16:'👾',32:'🔥',64:'💅',128:'🌈',256:'😈',512:'🦑',1024:'🧿',2048:'⚗️',4096:'🕳️'};
      return { text: map[v]||'👁️', cls: 'tile-mode-emoji' };
    },
  },
  {
    id:'occult', icon:'🌙', label:'Occult Sigils',
    render: v => {
      // Combining alchemical / astrological / runic symbols
      const map={2:'☽',4:'☿',8:'♀',16:'♂',32:'♃',64:'♄',128:'⛎',256:'ᚦ',512:'ᚷ',1024:'ᚹ',2048:'ᛟ',4096:'⛧'};
      return { text: map[v]||'✦', cls: 'tile-mode-occult', glow: true };
    },
  },
];

let currentTileMode = 'numbers';

function tileLabel(val) {
  const mode = TILE_MODES.find(m=>m.id===currentTileMode) || TILE_MODES[0];
  return mode.render(val);
}

function buildAnimPicker() {
  const container = $('#animPicker');
  container.innerHTML = '';
  for (const a of ANIMS) {
    const d = document.createElement('div');
    d.className = 'pick-row' + (a.id === currentAnim ? ' selected' : '');
    d.innerHTML = `<span class="pick-icon">${a.icon}</span>${a.label}<span class="pick-check">✓</span>`;
    d.onclick = () => selectAnim(a.id);
    container.appendChild(d);
  }
}

function buildTilePicker() {
  const container = $('#tilePicker');
  container.innerHTML = '';
  for (const m of TILE_MODES) {
    const d = document.createElement('div');
    d.className = 'pick-row' + (m.id === currentTileMode ? ' selected' : '');
    d.innerHTML = `<span class="pick-icon">${m.icon}</span>${m.label}<span class="pick-check">✓</span>`;
    d.onclick = () => selectTileMode(m.id);
    container.appendChild(d);
  }
}

function selectAnim(id) {
  currentAnim = id;
  buildAnimPicker();
}

function selectTileMode(id) {
  currentTileMode = id;
  buildTilePicker();
  renderInstant();
}

function openSettings() {
  syncThemePicker();
  $('#settingsBackdrop').classList.add('show');
  $('#settingsPanel').classList.add('show');
}

function closeSettings() {
  $('#settingsBackdrop').classList.remove('show');
  $('#settingsPanel').classList.remove('show');
}

$('#settingsBtn').addEventListener('click', openSettings);
$('#settingsBackdrop').addEventListener('click', closeSettings);

// ── Canvas FX layer ──────────────────────────────────────
const fxCanvas = $('#fx');
const fxCtx    = fxCanvas.getContext('2d');
let   fxParticles = [];
let   fxRaf       = null;

function resizeFxCanvas() {
  const wrap = $('.board-wrap');
  const r    = wrap.getBoundingClientRect();
  fxCanvas.width  = r.width;
  fxCanvas.height = r.height;
}

function fxLoop() {
  // 1. Update all and cull dead ones FIRST
  fxParticles = fxParticles.filter(p => { p.update(); return p.alive(); });

  // 2. Clear the canvas
  fxCtx.clearRect(0,0,fxCanvas.width,fxCanvas.height);

  // 3. Draw only the survivors
  for (const p of fxParticles) p.draw(fxCtx);

  // 4. Continue, or stop with a guaranteed-clean canvas
  if (fxParticles.length > 0) {
    fxRaf = requestAnimationFrame(fxLoop);
  } else {
    fxCtx.clearRect(0,0,fxCanvas.width,fxCanvas.height);
    fxRaf = null;
  }
}

function fxStart() {
  if (!fxRaf) fxRaf = requestAnimationFrame(fxLoop);
}

function fxKill() {
  fxParticles = [];
  if (fxRaf) { cancelAnimationFrame(fxRaf); fxRaf = null; }
  fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
}

// Returns canvas coords of tile centre
function tileCentre(r, c) {
  const sz = cellSize();
  const x  = PAD + c*(sz+GAP) + sz/2;
  const y  = PAD + r*(sz+GAP) + sz/2;
  return {x, y};
}

// ── Particle classes ────────────────────────────────────

class Particle {
  constructor(x,y,vx,vy,life,color,size) {
    this.x=x; this.y=y; this.vx=vx; this.vy=vy;
    this.life=life; this.maxLife=life;
    this.color=color; this.size=size;
  }
  update() { this.x+=this.vx; this.y+=this.vy; this.life--; }
  alive()  { return this.life>0; }
  alpha()  { return this.life/this.maxLife; }
}

class DotParticle extends Particle {
  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = this.alpha();
    ctx.fillStyle   = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  }
}

class SquareParticle extends Particle {
  constructor(x,y,vx,vy,life,color,size,rot,rotV) {
    super(x,y,vx,vy,life,color,size);
    this.rot=rot; this.rotV=rotV;
  }
  update() { super.update(); this.vy+=0.12; this.rot+=this.rotV; }
  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = this.alpha();
    ctx.fillStyle   = this.color;
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    ctx.fillRect(-this.size/2,-this.size/2, this.size, this.size);
    ctx.restore();
  }
}

class EmberParticle extends Particle {
  constructor(x,y,vx,vy,life,color) {
    super(x,y,vx,vy,life,color,2);
    this.flicker = Math.random()*Math.PI*2;
  }
  update() {
    super.update();
    this.vy -= 0.25 + Math.random()*0.1; // rise
    this.vx += (Math.random()-0.5)*0.3;
    this.flicker += 0.3;
    this.size = 1.5 + Math.sin(this.flicker)*1.2;
  }
  draw(ctx) {
    const a = this.alpha();
    ctx.save();
    ctx.globalAlpha = a;
    const grad = ctx.createRadialGradient(this.x,this.y,0,this.x,this.y,this.size*2);
    grad.addColorStop(0, '#fff');
    grad.addColorStop(0.3, this.color);
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size*2, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  }
}

class Fireball extends Particle {
  constructor(x,y,radius) {
    super(x,y,0,0,35,null,radius);
    this.maxRadius = radius;
  }
  update() { this.life--; }
  draw(ctx) {
    const t = 1 - this.life/this.maxLife;
    const r = this.maxRadius * (0.2 + t*0.8);
    const a = this.alpha();
    ctx.save();
    ctx.globalAlpha = a * 0.9;
    const grad = ctx.createRadialGradient(this.x,this.y,0,this.x,this.y,r);
    grad.addColorStop(0,   '#fff');
    grad.addColorStop(0.15,'#ffe060');
    grad.addColorStop(0.4, '#ff6600');
    grad.addColorStop(0.7, '#cc1100');
    grad.addColorStop(1,   'transparent');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(this.x,this.y, r, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  }
}

class ShockWave extends Particle {
  constructor(x,y,maxR) {
    super(x,y,0,0,25,null,0);
    this.maxR=maxR;
  }
  update() { this.life--; }
  draw(ctx) {
    const t = 1-this.life/this.maxLife;
    const r = this.maxR * t;
    const a = this.alpha() * 0.8;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.strokeStyle = '#ff9900';
    ctx.lineWidth   = 4*(1-t)+1;
    ctx.beginPath();
    ctx.arc(this.x,this.y,r,0,Math.PI*2);
    ctx.stroke();
    ctx.restore();
  }
}

class SmokeParticle extends Particle {
  constructor(x,y,vx,vy,life) {
    super(x,y,vx,vy,life,'#555',8+Math.random()*12);
  }
  update() { super.update(); this.vy-=0.08; this.size+=0.3; this.vx+=(Math.random()-0.5)*0.15; }
  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = this.alpha()*0.25;
    ctx.fillStyle   = this.color;
    ctx.beginPath();
    ctx.arc(this.x,this.y,this.size,0,Math.PI*2);
    ctx.fill();
    ctx.restore();
  }
}

class NeonRing extends Particle {
  constructor(x,y,maxR,color) {
    super(x,y,0,0,22,color,0);
    this.maxR=maxR;
  }
  update() { this.life--; }
  draw(ctx) {
    const t = 1-this.life/this.maxLife;
    const r = this.maxR * t;
    const a = this.alpha();
    ctx.save();
    ctx.globalAlpha = a;
    ctx.strokeStyle = this.color;
    ctx.lineWidth   = 3*(1-t)+0.5;
    ctx.shadowBlur  = 12;
    ctx.shadowColor = this.color;
    ctx.beginPath();
    ctx.arc(this.x,this.y,r,0,Math.PI*2);
    ctx.stroke();
    ctx.restore();
  }
}

class StarParticle extends Particle {
  constructor(x,y,vx,vy,life,color,size,points) {
    super(x,y,vx,vy,life,color,size);
    this.points=points||5;
    this.rot=Math.random()*Math.PI;
    this.rotV=(Math.random()-0.5)*0.15;
  }
  update() { super.update(); this.vy-=0.05; this.rot+=this.rotV; }
  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = this.alpha();
    ctx.fillStyle   = this.color;
    ctx.translate(this.x,this.y);
    ctx.rotate(this.rot);
    ctx.beginPath();
    const s=this.size, p=this.points;
    for(let i=0;i<p*2;i++){
      const r2 = i%2===0?s:s*0.4;
      const a  = (i/p/2)*Math.PI*2-Math.PI/2;
      i===0?ctx.moveTo(Math.cos(a)*r2,Math.sin(a)*r2):ctx.lineTo(Math.cos(a)*r2,Math.sin(a)*r2);
    }
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

class ShardParticle extends Particle {
  constructor(x,y,vx,vy,life,color,size) {
    super(x,y,vx,vy,life,color,size);
    this.rot=Math.random()*Math.PI*2;
    this.rotV=(Math.random()-0.5)*0.25;
    this.pts=[];
    const n=3+Math.floor(Math.random()*3);
    for(let i=0;i<n;i++) {
      const a=Math.random()*Math.PI*2;
      const r=size*(0.5+Math.random()*0.8);
      this.pts.push([Math.cos(a)*r, Math.sin(a)*r]);
    }
  }
  update() { super.update(); this.vy+=0.18; this.rot+=this.rotV; }
  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = this.alpha();
    ctx.fillStyle   = this.color;
    ctx.translate(this.x,this.y); ctx.rotate(this.rot);
    ctx.beginPath();
    this.pts.forEach(([px,py],i)=>i?ctx.lineTo(px,py):ctx.moveTo(px,py));
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

// ── Effect launchers ─────────────────────────────────────

function rand(a,b){ return a+Math.random()*(b-a); }
function randColor(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

function spawnFx(animId, r, c, val) {
  resizeFxCanvas();
  const {x,y} = tileCentre(r,c);
  const sz     = cellSize();
  const col    = (TILE_COLORS[val]||TILE_COLORS[2048])[0];

  switch(animId) {
    case 'neon':    fxNeon(x,y,sz,col);    break;
    case 'confetti':fxConfetti(x,y);       break;
    case 'galaxy':  fxGalaxy(x,y,col);     break;
    case 'glitch':  /* tile CSS handles it */ break;
    case 'shatter': fxShatter(x,y,sz,col); break;
    case 'inferno': fxInferno(x,y,sz);     break;
    default: break; // clean — no particles
  }
  fxStart();
}

function fxNeon(x,y,sz,col) {
  const colors = [col,'#c084fc','#7c6af7','#fff'];
  for(let i=0;i<3;i++)
    fxParticles.push(new NeonRing(x,y, sz*(0.6+i*0.5), randColor(colors)));
  for(let i=0;i<14;i++) {
    const a=Math.random()*Math.PI*2, sp=rand(1,4);
    fxParticles.push(new DotParticle(x,y, Math.cos(a)*sp,Math.sin(a)*sp, rand(14,22), randColor(colors), rand(2,5)));
  }
}

function fxConfetti(x,y) {
  const colors=['#f43f5e','#f97316','#eab308','#22c55e','#3b82f6','#a855f7','#ec4899','#fff'];
  for(let i=0;i<40;i++) {
    const a=Math.random()*Math.PI*2, sp=rand(2,7);
    fxParticles.push(new SquareParticle(
      x,y, Math.cos(a)*sp,Math.sin(a)*sp-2,
      rand(22,32), randColor(colors), rand(4,9),
      Math.random()*Math.PI*2, (Math.random()-0.5)*0.25
    ));
  }
}

function fxGalaxy(x,y,col) {
  const colors = [col,'#c084fc','#7c6af7','#e8c0ff','#fff','#d4aaff'];
  for(let i=0;i<30;i++) {
    const a=Math.random()*Math.PI*2, sp=rand(1,5);
    fxParticles.push(new StarParticle(
      x,y, Math.cos(a)*sp,Math.sin(a)*sp-1,
      rand(20,32), randColor(colors), rand(3,8), rand(4,6)
    ));
  }
  for(let i=0;i<20;i++) {
    const a=Math.random()*Math.PI*2, sp=rand(0.5,3);
    fxParticles.push(new DotParticle(x,y, Math.cos(a)*sp,Math.sin(a)*sp, rand(18,28), randColor(colors), rand(1,3)));
  }
}

function fxShatter(x,y,sz,col) {
  const lighter = col+'cc';
  for(let i=0;i<20;i++) {
    const a=Math.random()*Math.PI*2, sp=rand(2,8);
    fxParticles.push(new ShardParticle(
      x,y, Math.cos(a)*sp,Math.sin(a)*sp-1,
      rand(18,28), i%3===0?'#fff':lighter, rand(sz*0.06,sz*0.18)
    ));
  }
  fxParticles.push(new NeonRing(x,y,sz*0.8,'#fff'));
}

function fxInferno(x,y,sz) {
  fxParticles.push(new Fireball(x,y, sz*2.2));
  fxParticles.push(new Fireball(x,y, sz*1.5));
  fxParticles.push(new ShockWave(x,y, sz*3.5));
  fxParticles.push(new ShockWave(x,y, sz*2.5));
  const emberColors=['#ff4400','#ff7700','#ffaa00','#ffee00','#fff'];
  for(let i=0;i<80;i++) {
    const a=Math.random()*Math.PI*2, sp=rand(1,9);
    fxParticles.push(new EmberParticle(
      x+rand(-sz*0.3,sz*0.3), y+rand(-sz*0.3,sz*0.3),
      Math.cos(a)*sp, Math.sin(a)*sp-rand(1,4),
      rand(20,32), randColor(emberColors)
    ));
  }
  for(let i=0;i<12;i++) {
    fxParticles.push(new SmokeParticle(
      x+rand(-sz*0.5,sz*0.5), y+rand(-sz*0.3,sz*0.3),
      rand(-0.5,0.5), rand(-2,-0.5), rand(25,32)
    ));
  }
  for(let i=0;i<25;i++) {
    const a=Math.random()*Math.PI*2, sp=rand(4,14);
    fxParticles.push(new DotParticle(
      x,y, Math.cos(a)*sp,Math.sin(a)*sp-2,
      rand(12,22), randColor(emberColors), rand(1,3)
    ));
  }
}

// ═══════════════════════════════════════════════════════════
//  GAME STATE
// ═══════════════════════════════════════════════════════════
let grid, score, best, prevGrid, prevScore;
let gameWon, gameOver, busy;
let wonAcked = new Set();
let uid = 0;
let elMap = {};

function cellSize() {
  const w = $('#tc').getBoundingClientRect().width;
  return (w - GAP*(N-1)) / N;
}
function cellXY(r,c) { const sz=cellSize(); return {x:c*(sz+GAP), y:r*(sz+GAP)}; }

const mkGrid    = () => Array.from({length:N},()=>Array(N).fill(null));
const deepClone = g  => g.map(row=>row.map(cell=>cell?{...cell}:null));

function spawnTile(g) {
  const empty=[];
  for(let r=0;r<N;r++) for(let c=0;c<N;c++) if(!g[r][c]) empty.push([r,c]);
  if(!empty.length) return null;
  const [r,c]=empty[Math.floor(Math.random()*empty.length)];
  g[r][c]={val:Math.random()<0.9?2:4, id:++uid};
  return [r,c];
}

function computeMove(dir) {
  const lines=[];
  if     (dir===0) for(let c=0;c<N;c++){const l=[];for(let r=0;r<N;r++) l.push([r,c]);lines.push(l);}
  else if(dir===1) for(let r=0;r<N;r++){const l=[];for(let c=N-1;c>=0;c--)l.push([r,c]);lines.push(l);}
  else if(dir===2) for(let c=0;c<N;c++){const l=[];for(let r=N-1;r>=0;r--)l.push([r,c]);lines.push(l);}
  else             for(let r=0;r<N;r++){const l=[];for(let c=0;c<N;c++) l.push([r,c]);lines.push(l);}

  const ng=deepClone(grid);
  const moves=[]; let gained=0,anyMoved=false;

  for(const line of lines){
    const tiles=line.map(([r,c])=>({...ng[r][c],r,c})).filter(t=>t.val);
    for(const [r,c] of line) ng[r][c]=null;
    let wi=0,ti=0;
    while(ti<tiles.length){
      const [wr,wc]=line[wi];
      if(ti+1<tiles.length && tiles[ti].val===tiles[ti+1].val){
        const nv=tiles[ti].val*2;
        ng[wr][wc]={val:nv,id:tiles[ti].id};
        gained+=nv;
        moves.push({id:tiles[ti].id,   fromR:tiles[ti].r,   fromC:tiles[ti].c,   toR:wr,toC:wc,absorbed:false,mergedVal:nv});
        moves.push({id:tiles[ti+1].id, fromR:tiles[ti+1].r, fromC:tiles[ti+1].c, toR:wr,toC:wc,absorbed:true, mergedVal:nv});
        if(tiles[ti].r!==wr||tiles[ti].c!==wc||tiles[ti+1].r!==wr||tiles[ti+1].c!==wc) anyMoved=true;
        wi++;ti+=2;
      } else {
        ng[wr][wc]=tiles[ti];
        moves.push({id:tiles[ti].id,fromR:tiles[ti].r,fromC:tiles[ti].c,toR:wr,toC:wc,absorbed:false,mergedVal:0});
        if(tiles[ti].r!==wr||tiles[ti].c!==wc) anyMoved=true;
        wi++;ti++;
      }
    }
  }
  return anyMoved?{newGrid:ng,gained,moves}:null;
}

function findCell(g,id){
  for(let r=0;r<N;r++) for(let c=0;c<N;c++) if(g[r][c]?.id===id) return [r,c];
  return [0,0];
}

// ═══════════════════════════════════════════════════════════
//  DOM
// ═══════════════════════════════════════════════════════════
function buildBg(){
  const bg=$('#bgGrid'); bg.innerHTML='';
  for(let i=0;i<N*N;i++){const d=document.createElement('div');d.className='bg-cell';bg.appendChild(d);}
}

function makeTileEl(id,val,r,c){
  const sz=cellSize(), {x,y}=cellXY(r,c);
  const {text,cls,glow}=tileLabel(val);

  // Font size: depends on mode and text length
  let fs;
  if (cls==='tile-mode-greek' || cls==='tile-mode-occult' || cls==='tile-mode-emoji') {
    fs = '1.6rem';
  } else {
    const len = text.length;
    fs = len<=2?'2rem': len<=4?'1.6rem': len<=6?'1.1rem':'0.78rem';
  }

  const vClass = TILE_COLORS[val] ? `tile-v${val}` : 'tile-vmax';
  const el=document.createElement('div');
  el.className='tile ' + vClass + (cls?' '+cls:'') + (glow?' tile-occult-glow':'');
  el.dataset.tid=id; el.textContent=text;
  el.style.cssText=`width:${sz}px;height:${sz}px;font-size:${fs};--tx:translate(${x}px,${y}px);transform:translate(${x}px,${y}px);`;
  return el;
}

function renderInstant(spawnPos){
  const tc=$('#tc'); tc.innerHTML=''; elMap={};
  for(let r=0;r<N;r++) for(let c=0;c<N;c++){
    const cell=grid[r][c]; if(!cell) continue;
    const el=makeTileEl(cell.id,cell.val,r,c);
    if(spawnPos&&spawnPos[0]===r&&spawnPos[1]===c){
      el.classList.add('tile-new');
    }
    tc.appendChild(el); elMap[cell.id]=el;
  }
}

function animateMove(moves,newGrid,spawnPos,onDone){
  fxKill(); // clear any lingering particles from previous move
  const anim   = ANIMS.find(a=>a.id===currentAnim);
  const easing = 'cubic-bezier(0.25,0,0.25,1)';

  const mergeDests=[];
  for(const m of moves){
    if(!m.absorbed && m.mergedVal){
      mergeDests.push({r:m.toR,c:m.toC,val:m.mergedVal});
    }
  }

  const animations=moves.map(m=>{
    const el=elMap[m.id]; if(!el) return null;
    const from=cellXY(m.fromR,m.fromC);
    const to  =cellXY(m.toR,  m.toC);
    el.style.zIndex=m.absorbed?'1':'2';
    // fill:'none' — we handle final position ourselves in renderInstant
    return el.animate(
      [{transform:`translate(${from.x}px,${from.y}px)`},{transform:`translate(${to.x}px,${to.y}px)`}],
      {duration:SLIDE, easing, fill:'none'}
    );
  }).filter(Boolean);

  Promise.all(animations.map(a=>a.finished)).then(()=>{
    grid=newGrid;
    renderInstant(spawnPos);

    // Add merge class and auto-remove it when the animation ends
    for(const {r,c,val} of mergeDests){
      for(const [id,el] of Object.entries(elMap)){
        const tid=parseInt(el.dataset.tid);
        if(grid[r][c]?.id===tid){
          el.classList.add(anim.tileClass);
          spawnFx(currentAnim,r,c,val);
          break;
        }
      }
    }

    busy=false; onDone();
  });
}

function findCellEl(el){
  const tid=parseInt(el.dataset.tid);
  for(let r=0;r<N;r++) for(let c=0;c<N;c++) if(grid[r][c]?.id===tid) return {r,c};
  return null;
}

// ═══════════════════════════════════════════════════════════
//  GAME LOGIC
// ═══════════════════════════════════════════════════════════
function saveHistory() {
  pushHistory('2048-history', {
    ts: Date.now(),
    grid: grid,
    score: score,
    best: best,
    gameWon: gameWon,
    gameOver: gameOver,
    wonAcked: [...wonAcked],
  });
}

function newGame(){
  uid=0;elMap={};fxParticles=[];
  if(fxRaf){cancelAnimationFrame(fxRaf);fxRaf=null;}
  fxCtx.clearRect(0,0,fxCanvas.width,fxCanvas.height);
  grid=mkGrid();score=0;
  gameWon=gameOver=busy=false; wonAcked=new Set();
  prevGrid=prevScore=null;
  best=loadJSON('2048best', 0);
  spawnTile(grid);spawnTile(grid);
  updateUI();hideOverlay();renderInstant();
  $('#undoBtn').disabled=true;
}

function restore2048(){
  const history=loadJSON('2048-history',[]);
  if(!history.length) return false;
  const s=history[history.length-1];
  if(!s||!s.grid) return false;
  elMap={};fxParticles=[];
  if(fxRaf){cancelAnimationFrame(fxRaf);fxRaf=null;}
  fxCtx.clearRect(0,0,fxCanvas.width,fxCanvas.height);
  grid=s.grid; score=s.score; best=s.best;
  gameWon=s.gameWon; gameOver=s.gameOver; busy=false;
  wonAcked=new Set(s.wonAcked||[]);
  prevGrid=null; prevScore=null;
  uid=0;
  for(let r=0;r<N;r++) for(let c=0;c<N;c++) if(grid[r][c]?.id>uid) uid=grid[r][c].id;
  updateUI(); hideOverlay(); renderInstant();
  $('#undoBtn').disabled=true;
  return true;
}

function doMove(dir){
  if(busy||gameOver) return;
  const result=computeMove(dir); if(!result) return;
  busy=true;
  prevGrid=deepClone(grid); prevScore=score;
  $('#undoBtn').disabled=false;
  score+=result.gained;
  if(score>best){best=score;saveJSON('2048best',best);}
  updateUI();
  const nextGrid=result.newGrid;
  const sp=spawnTile(nextGrid);
  animateMove(result.moves,nextGrid,sp,()=>{
    if(!gameWon) checkWin();
    if(!hasMoves()) showOverlay(false);
    saveHistory();
  });
}

function undo(){
  if(!prevGrid||busy) return;
  grid=prevGrid;score=prevScore;
  prevGrid=prevScore=null;
  gameOver=false;hideOverlay();
  updateUI();renderInstant();
  $('#undoBtn').disabled=true;
}

const WIN_MILESTONES=[2048,4096];
function checkWin(){
  let topVal=0;
  for(let r=0;r<N;r++) for(let c=0;c<N;c++) if(grid[r][c]?.val>topVal) topVal=grid[r][c].val;
  for(const ms of WIN_MILESTONES){
    if(topVal>=ms&&!wonAcked.has(ms)){gameWon=true;showOverlay(true,ms);return;}
  }
}

function hasMoves(){
  for(let r=0;r<N;r++) for(let c=0;c<N;c++){
    if(!grid[r][c]) return true;
    if(c<N-1&&grid[r][c].val===grid[r][c+1]?.val) return true;
    if(r<N-1&&grid[r][c].val===grid[r+1][c]?.val) return true;
  }
  return false;
}

// ═══════════════════════════════════════════════════════════
//  UI
// ═══════════════════════════════════════════════════════════
function updateUI(){
  $('#score').textContent=score.toLocaleString();
  $('#best').textContent =best.toLocaleString();
}
function showOverlay(won,milestone){
  $('#bannerTitle').textContent=won?(milestone===4096?'You got 4096! 🔥':'You win! 🎉'):'Game Over';
  $('#bannerSub').textContent  =won?`Score: ${score.toLocaleString()}`:'No moves left';
  $('#keepGoingBtn').style.display=won?'block':'none';
  $('#keepGoingBtn').dataset.milestone=milestone||'';
  $('#banner').classList.add('show');
  gameOver=!won;
}
function keepGoing(){
  const ms=parseInt($('#keepGoingBtn').dataset.milestone);
  if(ms) wonAcked.add(ms);
  gameWon=false; hideOverlay();
}
function hideOverlay(){$('#banner').classList.remove('show');}

// ═══════════════════════════════════════════════════════════
//  INPUT
// ═══════════════════════════════════════════════════════════
const KEYMAP={ArrowUp:0,w:0,W:0,ArrowRight:1,d:1,D:1,ArrowDown:2,s:2,S:2,ArrowLeft:3,a:3,A:3};
document.addEventListener('keydown',e=>{
  if(KEYMAP[e.key]!==undefined){e.preventDefault();doMove(KEYMAP[e.key]);}
});

let tx=0,ty=0,tActive=false;
document.body.addEventListener('touchstart',e=>{tx=e.touches[0].clientX;ty=e.touches[0].clientY;tActive=true;},{passive:false});
document.body.addEventListener('touchmove', e=>e.preventDefault(),{passive:false});
document.body.addEventListener('touchend',  e=>{
  if(!tActive) return; tActive=false;
  const dx=e.changedTouches[0].clientX-tx, dy=e.changedTouches[0].clientY-ty;
  if(Math.abs(dx)<15&&Math.abs(dy)<15) return;
  if(Math.abs(dx)>Math.abs(dy)) doMove(dx>0?1:3);
  else                           doMove(dy>0?2:0);
},{passive:false});

window.addEventListener('resize',()=>{resizeFxCanvas();renderInstant();});

// ═══════════════════════════════════════════════════════════
//  BOOT
// ═══════════════════════════════════════════════════════════
buildBg();
buildAnimPicker();
buildTilePicker();
resizeFxCanvas();
if(!restore2048()) newGame();
