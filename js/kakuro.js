/* =========================================================
   Kakuro engine (browser-embedded) — generation + solver
   ========================================================= */
const K = (function(){
  function rng(seed){let s=seed>>>0;return ()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};}
  function segments(board,R,C){
    const H=[],V=[];
    for(let r=0;r<R;r++){let c=0;while(c<C){if(board[r][c]){let cs=[];while(c<C&&board[r][c]){cs.push([r,c]);c++;}H.push(cs);}else c++;}}
    for(let c=0;c<C;c++){let r=0;while(r<R){if(board[r][c]){let cs=[];while(r<R&&board[r][c]){cs.push([r,c]);r++;}V.push(cs);}else r++;}}
    return {H,V};
  }
  function layoutValid(board,R,C){
    const {H,V}=segments(board,R,C);
    for(const s of [...H,...V]) if(s.length<2 || s.length>9) return false;
    return true;
  }
  function whiteCount(board,R,C){let w=0;for(let r=0;r<R;r++)for(let c=0;c<C;c++)if(board[r][c])w++;return w;}
  function genLayout(R,C,blackFrac,rand){
    const interior=(R-1)*(C-1);
    const target=Math.round(interior*blackFrac);
    function blank(){const b=Array.from({length:R},()=>Array(C).fill(false));for(let r=1;r<R;r++)for(let c=1;c<C;c++)b[r][c]=true;return b;}
    let board=blank();
    function canBlacken(r,c){
      let cs=c; while(cs-1>=1 && board[r][cs-1]) cs--;
      let ce=c; while(ce+1<C && board[r][ce+1]) ce++;
      const left=c-cs, right=ce-c;
      if((left>0&&left<2)||(right>0&&right<2)) return false;
      let rs=r; while(rs-1>=1 && board[rs-1][c]) rs--;
      let re=r; while(re+1<R && board[re+1][c]) re++;
      const up=r-rs, down=re-r;
      if((up>0&&up<2)||(down>0&&down<2)) return false;
      return true;
    }
    function randomBreak(){
      let guard=0;
      while(guard++ < interior*4){
        const {H,V}=segments(board,R,C);
        const longs=[...H,...V].filter(s=>s.length>9);
        if(!longs.length) return true;
        const long=longs[Math.floor(rand()*longs.length)];
        const len=long.length, valid=[];
        for(let j=0;j<len;j++){ const left=j,right=len-1-j;
          if((left>0&&left<2)||(right>0&&right<2)||left>9||right>9) continue; valid.push(j); }
        for(let k=valid.length-1;k>0;k--){const m=Math.floor(rand()*(k+1));[valid[k],valid[m]]=[valid[m],valid[k]];}
        let done=false;
        for(const j of valid){ const [r,c]=long[j]; if(canBlacken(r,c)){ board[r][c]=false; done=true; break; } }
        if(!done) return false;
      }
      return false;
    }
    function crossSkeleton(){
      board=blank();
      function recurse(r0,r1,c0,c1){
        const h=r1-r0+1, w=c1-c0+1; if(h<=9&&w<=9) return;
        const splitRow = h>9 && (w<=9 || rand()<0.5);
        if(splitRow){ const lo=r0+2, hi=r1-2, mr=Math.max(r0+2,Math.min(r1-2, lo+Math.floor(rand()*(hi-lo+1))));
          for(let c=c0;c<=c1;c++)board[mr][c]=false; recurse(r0,mr-1,c0,c1); recurse(mr+1,r1,c0,c1); }
        else { const lo=c0+2, hi=c1-2, mc=Math.max(c0+2,Math.min(c1-2, lo+Math.floor(rand()*(hi-lo+1))));
          for(let r=r0;r<=r1;r++)board[r][mc]=false; recurse(r0,r1,c0,mc-1); recurse(r0,r1,mc+1,c1); }
      }
      recurse(1,R-1,1,C-1);
    }
    let ok=false; for(let t=0;t<10 && !ok;t++){ board=blank(); ok=randomBreak(); }
    if(!ok) crossSkeleton();
    let placed=0; for(let r=1;r<R;r++)for(let c=1;c<C;c++) if(!board[r][c]) placed++;
    let attempts=0, cap=interior*40;
    while(placed<target && attempts<cap){
      attempts++;
      const r=1+Math.floor(rand()*(R-1)), c=1+Math.floor(rand()*(C-1));
      if(!board[r][c]) continue;
      if(canBlacken(r,c)){ board[r][c]=false; placed++; }
    }
    if(!layoutValid(board,R,C)) return null;
    return board;
  }
  function fillSolution(board,R,C,rand){
    const {H,V}=segments(board,R,C);
    const cells=[],idx={};
    for(let r=0;r<R;r++)for(let c=0;c<C;c++)if(board[r][c]){idx[r+','+c]=cells.length;cells.push([r,c]);}
    const constr=[...H,...V].filter(s=>s.length>=2);
    const segOf=cells.map(()=>[]);
    constr.forEach((s,si)=>s.forEach(([r,c])=>segOf[idx[r+','+c]].push(si)));
    const used=constr.map(()=>0), val=cells.map(()=>0);
    let steps=0; const cap=200000;
    function pc(x){let n=0;while(x){x&=x-1;n++;}return n;}
    function dom(i){let d=0b1111111110;for(const si of segOf[i])d&=~used[si];return d;}
    function bt(){
      if(++steps>cap) return false;
      let best=-1,bd=0,bs=99;
      for(let i=0;i<cells.length;i++){ if(val[i])continue; const d=dom(i); const s=pc(d); if(s===0)return false; if(s<bs){bs=s;best=i;bd=d; if(s===1)break;} }
      if(best===-1) return true;
      const ord=[];for(let d=1;d<=9;d++)if(bd&(1<<d))ord.push(d);
      for(let k=ord.length-1;k>0;k--){const j=Math.floor(rand()*(k+1));[ord[k],ord[j]]=[ord[j],ord[k]];}
      for(const d of ord){const bit=1<<d;
        val[best]=d;for(const si of segOf[best])used[si]|=bit;
        if(bt())return true;
        val[best]=0;for(const si of segOf[best])used[si]&=~bit;
        if(steps>cap)return false;
      }
      return false;
    }
    if(!bt())return null;
    const sol=Array.from({length:R},()=>Array(C).fill(0));
    cells.forEach(([r,c],i)=>sol[r][c]=val[i]);
    return sol;
  }
  function deriveClues(board,sol,R,C){
    const clues=Array.from({length:R},()=>Array(C).fill(null));
    const {H,V}=segments(board,R,C);
    for(const s of H){if(s.length<2)continue;const[r,c0]=s[0];const sum=s.reduce((a,[r,c])=>a+sol[r][c],0);if(!clues[r][c0-1])clues[r][c0-1]={};clues[r][c0-1].right=sum;}
    for(const s of V){if(s.length<2)continue;const[r0,c]=s[0];const sum=s.reduce((a,[r,c])=>a+sol[r][c],0);if(!clues[r0-1][c])clues[r0-1][c]={};clues[r0-1][c].down=sum;}
    return clues;
  }
  const comboCache={};
  function combos(len,sum){const k=len+'_'+sum;if(comboCache[k])return comboCache[k];const res=[];(function rec(st,len,sum,mask){if(len===0){if(sum===0)res.push(mask);return;}for(let d=st;d<=9;d++){if(d>sum)break;rec(d+1,len-1,sum-d,mask|(1<<d));}})(1,len,sum,0);comboCache[k]=res;return res;}
  const ccCache={};
  function comboCount(len,sum){const k=len+'_'+sum;if(ccCache[k]!==undefined)return ccCache[k];const n=combos(len,sum).length;ccCache[k]=n;return n;}
  function tightenCombos(board,R,C,rand,sol,iters,timeBudgetMs){
    const {H,V}=segments(board,R,C);
    const idx={},cells=[];
    for(let r=0;r<R;r++)for(let c=0;c<C;c++)if(board[r][c]){idx[r+','+c]=cells.length;cells.push([r,c]);}
    const runs=[]; const runOf=cells.map(()=>[]);
    for(const s of [...H,...V]){ if(s.length<2)continue; const ri=runs.length;
      const cl=s.map(([r,c])=>idx[r+','+c]); runs.push({cells:cl,len:s.length}); for(const ci of cl) runOf[ci].push(ri); }
    const val=cells.map(([r,c])=>sol[r][c]);
    const sum=runs.map(rn=>{let t=0;for(const ci of rn.cells)t+=val[ci];return t;});
    const cc=runs.map((rn,ri)=>comboCount(rn.len,sum[ri]));
    let score=cc.reduce((a,b)=>a+b,0);
    let best=val.slice(), bestScore=score;
    let T=Math.max(2, runs.length*0.15); const t0=Date.now();
    for(let it=0; it<iters && Date.now()-t0<timeBudgetMs; it++){
      const i=Math.floor(rand()*cells.length);
      const myRuns=runOf[i]; if(!myRuns.length) continue;
      let used=0; for(const ri of myRuns) for(const ci of runs[ri].cells) if(ci!==i) used|=1<<val[ci];
      const old=val[i]; const opts=[]; for(let d=1;d<=9;d++) if(d!==old && !(used&(1<<d))) opts.push(d);
      if(!opts.length) continue;
      const d=opts[Math.floor(rand()*opts.length)];
      let delta=0; const newCC={};
      for(const ri of myRuns){ const ns=sum[ri]-old+d; const ncc=comboCount(runs[ri].len,ns); newCC[ri]=[ns,ncc]; delta+=ncc-cc[ri]; }
      if(delta<=0 || rand()<Math.exp(-delta/T)){
        val[i]=d; for(const ri of myRuns){ sum[ri]=newCC[ri][0]; cc[ri]=newCC[ri][1]; } score+=delta;
        if(score<bestScore){ bestScore=score; best=val.slice(); }
      }
      T*=0.9995; if(T<0.05)T=0.05;
    }
    const grid=Array.from({length:R},()=>Array(C).fill(0));
    cells.forEach(([r,c],i)=>grid[r][c]=best[i]);
    return {sol:grid, score:bestScore};
  }
  function buildSegs(board,clues,R,C){
    const cells=[],idx={};
    for(let r=0;r<R;r++)for(let c=0;c<C;c++)if(board[r][c]){idx[r+','+c]=cells.length;cells.push([r,c]);}
    const {H,V}=segments(board,R,C);
    const segs=[];
    for(const s of H){if(s.length<2)continue;const[r0,c0]=s[0];segs.push({cells:s.map(([r,c])=>idx[r+','+c]),target:clues[r0][c0-1].right});}
    for(const s of V){if(s.length<2)continue;const[r0,c0]=s[0];segs.push({cells:s.map(([r,c])=>idx[r+','+c]),target:clues[r0-1][c0].down});}
    const segOf=cells.map(()=>[]);
    segs.forEach((s,si)=>s.cells.forEach(ci=>segOf[ci].push(si)));
    segs.forEach(s=>{let m=0;for(const cm of combos(s.cells.length,s.target))m|=cm;s.allowed=m;});
    return {cells,idx,segs,segOf};
  }
  function solve(board,clues,R,C,limit=2,fixed=null){
    const {cells,segs,segOf}=buildSegs(board,clues,R,C);
    const val=cells.map(()=>0),usedMask=segs.map(()=>0),remSum=segs.map(s=>s.target),remCnt=segs.map(s=>s.cells.length);
    if(fixed){
      for(let i=0;i<cells.length;i++){const d=fixed[i];if(d){
        for(const si of segOf[i]){ if(usedMask[si]&(1<<d)) return {count:0,solution:null,cells}; usedMask[si]|=(1<<d);remSum[si]-=d;remCnt[si]--; }
        val[i]=d;
      }}
    }
    let count=0,firstSol=null;
    function pc(x){let n=0;while(x){x&=x-1;n++;}return n;}
    function dom(ci){let d=0b1111111110;for(const si of segOf[ci])d&=segs[si].allowed&~usedMask[si];return d;}
    function bt(){
      if(count>=limit)return;
      let best=-1,bd=0,bs=99;
      for(let i=0;i<cells.length;i++){if(val[i])continue;const d=dom(i);const s=pc(d);if(s===0)return;if(s<bs){bs=s;best=i;bd=d;if(s===1)break;}}
      if(best===-1){for(let si=0;si<segs.length;si++)if(remSum[si]!==0)return;count++;if(!firstSol)firstSol=val.slice();return;}
      for(let d=1;d<=9;d++){
        if(!(bd&(1<<d)))continue;let ok=true;
        for(const si of segOf[best]){const nrem=remSum[si]-d,ncnt=remCnt[si]-1;
          if(ncnt===0){if(nrem!==0){ok=false;break;}continue;}
          const avail=~(usedMask[si]|(1<<d));let mn=0,mx=0,g=0;
          for(let x=1;x<=9&&g<ncnt;x++)if(avail&(1<<x)){mn+=x;g++;}g=0;
          for(let x=9;x>=1&&g<ncnt;x--)if(avail&(1<<x)){mx+=x;g++;}
          if(nrem<mn||nrem>mx){ok=false;break;}
        }
        if(!ok)continue;
        val[best]=d;for(const si of segOf[best]){usedMask[si]|=(1<<d);remSum[si]-=d;remCnt[si]--;}
        bt();
        val[best]=0;for(const si of segOf[best]){usedMask[si]&=~(1<<d);remSum[si]+=d;remCnt[si]++;}
        if(count>=limit)return;
      }
    }
    bt();
    let grid=null;
    if(firstSol){grid=Array.from({length:R},()=>Array(C).fill(0));cells.forEach(([r,c],i)=>grid[r][c]=firstSol[i]);}
    return {count,solution:grid,cells};
  }
  function evaluate(board,clues,R,C,entries){
    const {H,V}=segments(board,R,C);
    const err=Array.from({length:R},()=>Array(C).fill(false));
    let filled=0,white=0,allRunsOk=true;
    for(let r=0;r<R;r++)for(let c=0;c<C;c++)if(board[r][c]){white++;if(entries[r][c])filled++;}
    function checkRun(s,clue){
      const vals=s.map(([r,c])=>entries[r][c]);
      const seen={};let sum=0,full=true;
      for(let i=0;i<s.length;i++){const v=vals[i];if(!v){full=false;continue;}sum+=v;
        if(seen[v]!==undefined){allRunsOk=false;const[r,c]=s[i];err[r][c]=true;const j=seen[v];const[rr,cc]=s[j];err[rr][cc]=true;}
        seen[v]=i;}
      if(full){ if(sum!==clue){allRunsOk=false;for(const[r,c]of s)err[r][c]=true;} }
      else { allRunsOk=false; if(sum>=clue){ for(const[r,c]of s)if(entries[r][c])err[r][c]=true; } }
    }
    for(const s of H){if(s.length<2)continue;const[r0,c0]=s[0];checkRun(s,clues[r0][c0-1].right);}
    for(const s of V){if(s.length<2)continue;const[r0,c0]=s[0];checkRun(s,clues[r0-1][c0].down);}
    return {err,complete:(filled===white&&allRunsOk),filled,white};
  }
  function hint(board,clues,R,C,entries,target){
    const {cells}=buildSegs(board,clues,R,C);
    const fixed=cells.map(([r,c])=>entries[r][c]||0);
    const res=solve(board,clues,R,C,1,fixed);
    if(res.count===0) return {conflict:true};
    if(target){ const {r,c}=target; if(board[r][c]) return {r,c,val:res.solution[r][c]}; }
    for(const [r,c] of cells){ if(!entries[r][c]) return {r,c,val:res.solution[r][c]}; }
    return null;
  }
  function candidates(board,clues,R,C,entries){
    const {H,V}=segments(board,R,C);
    const hRun={},vRun={};
    for(const s of H){if(s.length<2)continue;const[r0,c0]=s[0];const t=clues[r0][c0-1].right;let allow=0;for(const cm of combos(s.length,t))allow|=cm;let used=0;for(const[r,c]of s)if(entries[r][c])used|=1<<entries[r][c];for(const[r,c]of s)hRun[r+','+c]={allow,used};}
    for(const s of V){if(s.length<2)continue;const[r0,c0]=s[0];const t=clues[r0-1][c0].down;let allow=0;for(const cm of combos(s.length,t))allow|=cm;let used=0;for(const[r,c]of s)if(entries[r][c])used|=1<<entries[r][c];for(const[r,c]of s)vRun[r+','+c]={allow,used};}
    const out={};
    for(let r=0;r<R;r++)for(let c=0;c<C;c++)if(board[r][c]&&!entries[r][c]){
      let d=0b1111111110;const h=hRun[r+','+c],v=vRun[r+','+c];
      if(h)d&=h.allow&~h.used; if(v)d&=v.allow&~v.used;
      const list=[];for(let x=1;x<=9;x++)if(d&(1<<x))list.push(x);out[r+','+c]=list;
    }
    return out;
  }
  function generate(level, size, seed){
    const bdMap={ easy:0.34, medium:0.26, hard:0.16 };
    const bd = bdMap[level]!==undefined?bdMap[level]:0.26;
    const S = Math.max(5, Math.min(12, size||5));
    const R=S+1, C=S+1;
    const rand=rng(seed);
    let board=null,sol=null;
    for(let a=0;a<80 && !sol;a++){ board=genLayout(R,C,bd,rand); if(!board)continue; sol=fillSolution(board,R,C,rand); }
    if(!sol){ for(let a=0;a<400 && !sol;a++){ board=genLayout(R,C,Math.max(bd,0.2),rand); if(!board)continue; sol=fillSolution(board,R,C,rand); } }
    if(!board||!sol){ board=genLayout(R,C,0.4,rand)||genLayout(R,C,0.4,rng((seed^0x9e3779b9)>>>0)); sol=board?fillSolution(board,R,C,rand):null; }
    if(board&&sol){ const interior=(R-1)*(C-1); sol=tightenCombos(board,R,C,rand,sol,interior*500,150).sol; }
    const clues=deriveClues(board,sol,R,C);
    return {R,C,board,clues,solution:sol,level,seed};
  }
  return {segments,combos,comboCount,tightenCombos,solve,evaluate,hint,candidates,generate};
})();

/* =========================================================
   Game controller / UI
   ========================================================= */
const boardEl = $('#board'), numpadEl = $('#numpad'), toastEl = $('#toast');
const SAVE = 'kakuro_save_v1', SET = 'kakuro_settings_v1';

let G = null;
let curLevel = 'easy', curSize = 5;
let entries = [], notes = [];
let sel = null;
let notesMode = false;
let timer = 0, tick = null, won = false;
let errFlags = null;
let hintedCell = null;
let pendingFlash = null;

let settings = loadJSON(SET) || { autocheck: false, runs: true, dimpad: true, timer: true };

/* ---------- timer ---------- */
function startTimer() {
  stopTimer();
  if (!settings.timer) return;
  tick = setInterval(() => { if (!won) { timer++; $('#timer').textContent = formatTime(timer); } }, 1000);
}
function stopTimer() { if (tick) { clearInterval(tick); tick = null; } }

/* ---------- new game ---------- */
function newGame(size) {
  const level = $('#difficultySelect').value;
  curLevel = level;
  if (size !== undefined) curSize = size;
  won = false; hintedCell = null; errFlags = null;
  boardEl.style.filter = 'none'; boardEl.style.pointerEvents = 'auto';
  toast('Building a fresh grid…', 'cyan', 700);
  setTimeout(() => {
    const seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0;
    G = K.generate(curLevel, curSize, seed);
    entries = Array.from({ length: G.R }, () => Array(G.C).fill(0));
    notes = Array.from({ length: G.R }, () => Array(G.C).fill(null).map(() => new Set()));
    sel = firstWhite();
    timer = 0;
    $('#timer').textContent = settings.timer ? '0:00' : '—';
    syncControls();
    sizeBoard(); render(); startTimer(); persist();
  }, 20);
}

function syncControls() {
  $('#sizeVal').textContent = curSize + '×' + curSize;
  $('#sizeDown').disabled = curSize <= 5;
  $('#sizeUp').disabled = curSize >= 12;
}

function firstWhite() {
  for (let r = 0; r < G.R; r++) for (let c = 0; c < G.C; c++) if (G.board[r][c]) return { r, c };
  return null;
}

/* ---------- sizing ---------- */
function sizeBoard() {
  const wrap = document.querySelector('.board-wrap');
  const avail = wrap.clientWidth;
  const chrome = (G.C - 1) * 2 + 4 + 4;
  const cell = Math.floor((avail - chrome) / G.C);
  const clamped = Math.max(28, Math.min(70, cell));
  document.documentElement.style.setProperty('--cell', clamped + 'px');
  boardEl.style.gridTemplateColumns = 'repeat(' + G.C + ', 1fr)';
  boardEl.style.gridTemplateRows = 'repeat(' + G.R + ', 1fr)';
}
window.addEventListener('resize', () => { if (G) sizeBoard(); });

/* ---------- render ---------- */
function render() {
  boardEl.innerHTML = '';
  let runSet = new Set();
  if (sel && settings.runs) {
    const { H, V } = K.segments(G.board, G.R, G.C);
    for (const s of [...H, ...V]) {
      if (s.some(([r, c]) => r === sel.r && c === sel.c)) {
        for (const [r, c] of s) runSet.add(r + ',' + c);
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
          if (q.down) { const e = document.createElement('span'); e.className = 'down'; e.textContent = q.down; d.appendChild(e); }
          if (q.right) { const e = document.createElement('span'); e.className = 'right'; e.textContent = q.right; d.appendChild(e); }
          d.classList.add('tappable');
          d.addEventListener('click', ev => {
            let dir;
            if (q.right && !q.down) dir = 'right';
            else if (q.down && !q.right) dir = 'down';
            else {
              const rect = d.getBoundingClientRect();
              const x = (ev.clientX - rect.left) / rect.width;
              const y = (ev.clientY - rect.top) / rect.height;
              dir = (x >= y) ? 'right' : 'down';
            }
            showCombos(r, c, dir);
          });
        } else {
          d.className = 'cell block';
        }
      } else {
        d.className = 'cell white'; d.tabIndex = 0; d.dataset.r = r; d.dataset.c = c;
        const v = entries[r][c];
        if (v) {
          const b = document.createElement('span'); b.className = 'big'; b.textContent = v; d.appendChild(b);
        } else if (notes[r][c] && notes[r][c].size) {
          const n = document.createElement('div'); n.className = 'notes';
          for (let k = 1; k <= 9; k++) {
            const sp = document.createElement('span');
            sp.textContent = notes[r][c].has(k) ? k : '';
            n.appendChild(sp);
          }
          d.appendChild(n);
        }
        if (runSet.has(r + ',' + c)) d.classList.add('run');
        if (sel && sel.r === r && sel.c === c) d.classList.add('sel');
        if (errFlags && errFlags[r][c]) d.classList.add('err');
        if (hintedCell && hintedCell.r === r && hintedCell.c === c) d.classList.add('hinted');
        d.addEventListener('click', () => { sel = { r, c }; hintedCell = null; render(); });
      }
      boardEl.appendChild(d);
    }
  }
  renderNumpad();
  syncNotesBtn();
}

/* ---------- number pad ---------- */
function renderNumpad() {
  numpadEl.innerHTML = '';
  let cand = null;
  if (sel && settings.dimpad && !entries[sel.r][sel.c]) {
    const cmap = K.candidates(G.board, G.clues, G.R, G.C, entries);
    cand = cmap[sel.r + ',' + sel.c] || [];
  }
  for (let n = 1; n <= 9; n++) {
    const b = document.createElement('div'); b.className = 'num-btn';
    const label = document.createElement('span'); label.style.cssText = 'pointer-events:none'; label.textContent = n;
    b.appendChild(label);
    if (cand && !cand.includes(n)) b.classList.add('dim');
    b.addEventListener('pointerdown', () => input(n));
    numpadEl.appendChild(b);
  }
}

function syncNotesBtn() {
  const btn = $('#notesBtn');
  if (!btn) return;
  btn.textContent = notesMode ? '🔹 Notes' : '✏️ Normal';
  btn.classList.toggle('active', notesMode);
}

/* ---------- input ---------- */
function input(n) {
  if (!sel || won) return;
  const { r, c } = sel; if (!G.board[r][c]) return;
  hintedCell = null;
  if (notesMode && n !== 0) {
    if (!entries[r][c]) { const set = notes[r][c]; if (set.has(n)) set.delete(n); else set.add(n); }
  } else {
    if (n === 0) { entries[r][c] = 0; }
    else { entries[r][c] = n; notes[r][c].clear(); pendingFlash = { r, c }; }
  }
  afterChange();
}

function afterChange() {
  if (settings.autocheck) { errFlags = K.evaluate(G.board, G.clues, G.R, G.C, entries).err; }
  else { errFlags = null; }
  render();
  if (pendingFlash) {
    const sels = boardEl.querySelector('.cell.white.sel');
    if (sels) sels.classList.add('flash');
    pendingFlash = null;
  }
  persist();
  checkWin();
}

function checkWin() {
  const ev = K.evaluate(G.board, G.clues, G.R, G.C, entries);
  if (ev.complete) doWin();
}

function doWin() {
  won = true; stopTimer();
  const msgs = ['Every run sums true.', 'Clean grid. No contradictions.', 'Cross-sums all balanced.'];
  $('#overlayTitle').textContent = 'Grid Solved!';
  $('#overlayMsg').textContent = msgs[Math.floor(Math.random() * msgs.length)] + ' Finished in ' + formatTime(timer) + '.';
  $('#overlay').classList.add('show');
  localStorage.removeItem(SAVE);
}

/* ---------- tools ---------- */
function doHint() {
  if (won) return;
  const target = sel && !entries[sel.r][sel.c] ? sel : null;
  const res = K.hint(G.board, G.clues, G.R, G.C, entries, target);
  if (!res) { toast('Grid is already full.', 'cyan'); return; }
  if (res.conflict) { toast('Current entries conflict — nothing fits. Try clearing some cells.', 'coral', 2200); return; }
  entries[res.r][res.c] = res.val; notes[res.r][res.c].clear();
  sel = { r: res.r, c: res.c }; hintedCell = { r: res.r, c: res.c };
  pendingFlash = { r: res.r, c: res.c };
  afterChange();
  toast('Placed ' + res.val + ' — one cell logic guarantees.', 'cyan', 1400);
}

function clearEntries() {
  if (!G || won) return;
  entries = Array.from({ length: G.R }, () => Array(G.C).fill(0));
  notes = Array.from({ length: G.R }, () => Array(G.C).fill(null).map(() => new Set()));
  hintedCell = null; errFlags = null; sel = firstWhite();
  render(); persist();
}

function eraseCell() {
  if (!sel || won) return;
  const { r, c } = sel; if (!G.board[r][c]) return;
  entries[r][c] = 0; notes[r][c].clear(); hintedCell = null;
  afterChange();
}

/* ---------- combinations modal ---------- */
function runCells(r, c, dir) {
  const cells = [];
  if (dir === 'right') { let cc = c + 1; while (cc < G.C && G.board[r][cc]) { cells.push([r, cc]); cc++; } }
  else { let rr = r + 1; while (rr < G.R && G.board[rr][c]) { cells.push([rr, c]); rr++; } }
  return cells;
}

function showCombos(r, c, dir) {
  const q = G.clues[r][c]; if (!q) return;
  const sum = dir === 'right' ? q.right : q.down;
  if (!sum) return;
  const cells = runCells(r, c, dir);
  const len = cells.length;
  const placed = []; for (const [rr, cc] of cells) if (entries[rr][cc]) placed.push(entries[rr][cc]);
  let placedMask = 0; for (const d of placed) placedMask |= 1 << d;
  const dupPlaced = placed.length !== new Set(placed).size;
  const masks = K.combos(len, sum);
  const rows = masks.map(m => {
    const digits = []; for (let d = 1; d <= 9; d++) if (m & (1 << d)) digits.push(d);
    const compatible = !dupPlaced && ((m & placedMask) === placedMask);
    return { digits, mask: m, compatible };
  });
  let forced = 0b1111111110, anyCompat = false;
  for (const row of rows) if (row.compatible) { forced &= row.mask; anyCompat = true; }
  if (!anyCompat) forced = 0;
  const forcedDigits = []; for (let d = 1; d <= 9; d++) if (forced & (1 << d)) forcedDigits.push(d);

  $('#comboTitle').textContent = (dir === 'right' ? 'Across' : 'Down') + ' · sum ' + sum;
  const compatCount = rows.filter(x => x.compatible).length;
  const meta = masks.length === 1
    ? len + ' cells · only one way'
    : len + ' cells · ' + masks.length + ' combinations' + (placed.length && !dupPlaced && compatCount < masks.length ? ' · ' + compatCount + ' still possible' : '');
  $('#comboMeta').textContent = meta;

  const fc = $('#comboForced'); fc.innerHTML = '';
  const list = $('#comboList'); list.innerHTML = '';

  if (masks.length === 0) {
    const e = document.createElement('div'); e.className = 'combo-empty';
    e.textContent = 'No combination of ' + len + ' distinct digits sums to ' + sum + '.';
    list.appendChild(e);
  } else if (masks.length === 1) {
    const rd = document.createElement('div'); rd.className = 'combo-row';
    for (const d of rows[0].digits) {
      const ch = document.createElement('span'); ch.className = 'chip';
      if (placedMask & (1 << d)) ch.classList.add('placed'); else ch.classList.add('forced');
      ch.textContent = d; rd.appendChild(ch);
    }
    list.appendChild(rd);
  } else {
    if (forcedDigits.length) {
      const lab = document.createElement('span'); lab.className = 'lab'; lab.textContent = 'Always in'; fc.appendChild(lab);
      for (const d of forcedDigits) { const ch = document.createElement('span'); ch.className = 'chip sm forced'; ch.textContent = d; fc.appendChild(ch); }
    }
    rows.sort((a, b) => (b.compatible - a.compatible) || a.digits[0] - b.digits[0]);
    for (const row of rows) {
      const rd = document.createElement('div'); rd.className = 'combo-row' + (row.compatible ? '' : ' dim');
      for (const d of row.digits) {
        const ch = document.createElement('span'); ch.className = 'chip';
        if (row.compatible && (placedMask & (1 << d))) ch.classList.add('placed');
        else if (row.compatible && (forced & (1 << d))) ch.classList.add('forced');
        ch.textContent = d; rd.appendChild(ch);
      }
      list.appendChild(rd);
    }
  }
  $('#comboSheet').classList.add('show');
}

/* ---------- persistence ---------- */
function persist() {
  if (!G || won) return;
  saveJSON(SAVE, {
    G: { R: G.R, C: G.C, board: G.board, clues: G.clues, solution: G.solution, level: G.level, seed: G.seed },
    entries, notes: notes.map(r => r.map(s => [...s])), timer, level: curLevel, size: curSize
  });
}

function restore() {
  const s = loadJSON(SAVE);
  if (!s || !s.G) return false;
  G = s.G; entries = s.entries;
  notes = s.notes.map(r => r.map(a => new Set(a)));
  timer = s.timer || 0;
  curLevel = s.level || G.level || 'easy';
  curSize = s.size || (G.R - 1);
  sel = firstWhite(); won = false; errFlags = null;
  $('#timer').textContent = settings.timer ? formatTime(timer) : '—';
  $('#difficultySelect').value = curLevel;
  syncControls();
  sizeBoard(); render(); startTimer();
  return true;
}

/* ---------- toast ---------- */
let toastT = null;
function toast(msg, kind, ms) {
  toastEl.textContent = msg; toastEl.className = 'toast show' + (kind ? ' ' + kind : '');
  clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('show'), ms || 1300);
}

/* ---------- settings ---------- */
function syncSettingsUI() {
  $('#togAutocheck').checked = settings.autocheck;
  $('#togRuns').checked = settings.runs;
  $('#togDimpad').checked = settings.dimpad;
  $('#togTimer').checked = settings.timer;
}

function openSettings() {
  syncSettingsUI();
  $('#settingsBackdrop').classList.add('show');
  $('#settingsPanel').classList.add('show');
}
function closeSettings() {
  $('#settingsBackdrop').classList.remove('show');
  $('#settingsPanel').classList.remove('show');
}

function onToggle(id, key, after) {
  $('#' + id).addEventListener('change', e => {
    settings[key] = e.target.checked;
    saveJSON(SET, settings);
    if (after) after();
  });
}

/* ---------- keyboard ---------- */
document.addEventListener('keydown', e => {
  if ($('#overlay').classList.contains('show')) {
    if (e.key === 'Enter') { $('#overlay').classList.remove('show'); newGame(); }
    return;
  }
  if ($('#settingsPanel').classList.contains('show')) return;
  if ($('#comboSheet').classList.contains('show')) { if (e.key === 'Escape') $('#comboSheet').classList.remove('show'); return; }
  if (e.key >= '1' && e.key <= '9') { input(+e.key); e.preventDefault(); }
  else if (e.key === '0' || e.key === 'Backspace' || e.key === 'Delete') { eraseCell(); e.preventDefault(); }
  else if (e.key === 'n' || e.key === 'N') { notesMode = !notesMode; syncNotesBtn(); renderNumpad(); }
  else if (e.key.startsWith('Arrow') && sel) { moveSel(e.key); e.preventDefault(); }
  else if (e.key === 'h' || e.key === 'H') { doHint(); }
});

function moveSel(dir) {
  let { r, c } = sel;
  const dr = dir === 'ArrowUp' ? -1 : dir === 'ArrowDown' ? 1 : 0;
  const dc = dir === 'ArrowLeft' ? -1 : dir === 'ArrowRight' ? 1 : 0;
  for (let step = 0; step < Math.max(G.R, G.C); step++) {
    r += dr; c += dc;
    if (r < 0 || c < 0 || r >= G.R || c >= G.C) return;
    if (G.board[r][c]) { sel = { r, c }; hintedCell = null; render(); return; }
  }
}

/* ---------- wire up ---------- */
$('#newGameBtn').addEventListener('click', () => newGame());
$('#sizeDown').addEventListener('click', () => { if (curSize > 5) newGame(curSize - 1); });
$('#sizeUp').addEventListener('click', () => { if (curSize < 12) newGame(curSize + 1); });
$('#hintBtn').addEventListener('click', doHint);
$('#clearBtn').addEventListener('click', clearEntries);
$('#eraseBtn').addEventListener('click', eraseCell);
$('#notesBtn').addEventListener('click', () => { notesMode = !notesMode; syncNotesBtn(); renderNumpad(); });
$('#settingsBtn').addEventListener('click', openSettings);
$('#settingsBackdrop').addEventListener('click', closeSettings);
$('#overlayBtn').addEventListener('click', () => { $('#overlay').classList.remove('show'); newGame(); });
$('#overlay').addEventListener('click', e => { if (e.target === $('#overlay')) $('#overlay').classList.remove('show'); });
$('#closeCombo').addEventListener('click', () => $('#comboSheet').classList.remove('show'));
$('#comboSheet').addEventListener('click', e => { if (e.target === $('#comboSheet')) $('#comboSheet').classList.remove('show'); });

onToggle('togAutocheck', 'autocheck', () => {
  errFlags = settings.autocheck ? K.evaluate(G.board, G.clues, G.R, G.C, entries).err : null;
  render();
});
onToggle('togRuns', 'runs', render);
onToggle('togDimpad', 'dimpad', renderNumpad);
onToggle('togTimer', 'timer', () => {
  if (settings.timer) { startTimer(); } else { stopTimer(); $('#timer').textContent = '—'; }
});

/* ---------- boot ---------- */
syncSettingsUI();
if (!restore()) { newGame(); }
else if (!settings.timer) { $('#timer').textContent = '—'; }
if (!localStorage.getItem('kakuro_tip_combos')) {
  setTimeout(() => {
    toast('Tip: tap any clue number to see its possible combinations.', 'cyan', 3600);
    localStorage.setItem('kakuro_tip_combos', '1');
  }, 1400);
}
