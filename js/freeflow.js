/* ═══════════════════════════════════════════
   SETTINGS STATE  (persisted to localStorage)
═══════════════════════════════════════════ */
const DEFAULTS = {
  difficulty:   'medium',
  boardSize:    0,      // 0 = auto (difficulty decides), else 5..14
  classicBoard: true,   // the iconic black board + bright pipes
  requireFill:  true,   // solved = all pairs connected AND every cell covered
};

let cfg = Object.assign({}, DEFAULTS, loadJSON('freeflow-cfg', {}));
function saveCfg() { saveJSON('freeflow-cfg', cfg); }

function activeSize() {
  if (cfg.boardSize) return cfg.boardSize;
  return (FlowEngine.LEVELS[cfg.difficulty] || FlowEngine.LEVELS.medium).size;
}

/* Best-time bucket key. Explicit sizes get their own buckets so a 5×5
   expert best can't shadow an 11×11 one. */
function bestKey() { return `${size}x${size}-${cfg.difficulty}`; }

/* ═══════════════════════════════════════════
   CLASSIC PALETTE
   The Flow-style colour order: red, green, blue, yellow, orange, …
   On light themed (non-classic) boards a few colours swap to darker
   variants so white/yellow pipes stay visible.
═══════════════════════════════════════════ */
const PALETTE = [
  '#e23c32', '#37b34a', '#2e5ce6', '#f5d327', '#f28b24', '#28e0e0',
  '#ea3f8f', '#8e1b1b', '#7d2ee0', '#f0f0f0', '#8f8f8f', '#8ede3c',
  '#c9b47c', '#1b2a99', '#2e8f7a', '#ff80c0',
];
const PALETTE_LIGHT_OVERRIDES = {
  '#f5d327': '#d9a800', '#28e0e0': '#0d9aa8', '#f0f0f0': '#6b6b6b',
  '#8ede3c': '#56a11a', '#c9b47c': '#93794a', '#ff80c0': '#e0559d',
};

function flowColor(i, light) {
  const base = PALETTE[i % PALETTE.length];
  return light ? (PALETTE_LIGHT_OVERRIDES[base] || base) : base;
}

/* ═══════════════════════════════════════════
   GAME STATE
═══════════════════════════════════════════ */
let size = 7;
let flows = [];        // solution: [{ id, cells }] — partition of the grid
let dotAt = new Map(); // cell index → flow id (endpoints only)
let paths = [];        // user pipes: per flow an ordered cell list, [0] is a dot
let moves = 0, hintsUsed = 0;
let seconds = 0, timerInterval = null, timerStarted = false;
let gameOver = false;
let drawingFlow = null;      // flow id being dragged, or null
let strokeChanged = false;   // did the current stroke alter any pipe?
let pendingSnapshot = null;  // undo snapshot taken at stroke start
let undoStack = [];
let allConnectedToastShown = false;

const board = $('#board');
const canvas = document.createElement('canvas');
board.appendChild(canvas);
const ctx = canvas.getContext('2d');
let cssSize = 0;

/* ═══════════════════════════════════════════
   PIPE MODEL
═══════════════════════════════════════════ */
function flowEnds(f) {
  const cells = flows[f].cells;
  return [cells[0], cells[cells.length - 1]];
}

function isComplete(f) {
  const p = paths[f];
  if (p.length < 2) return false;
  const [a, b] = flowEnds(f);
  const first = p[0], last = p[p.length - 1];
  return (first === a && last === b) || (first === b && last === a);
}

function occupantAt(cell) {
  for (let g = 0; g < paths.length; g++) {
    const j = paths[g].indexOf(cell);
    if (j >= 0) return { flow: g, index: j };
  }
  return null;
}

function countConnected() {
  let n = 0;
  for (let f = 0; f < flows.length; f++) if (isComplete(f)) n++;
  return n;
}

function coveredCells() {
  let n = 0;
  for (const p of paths) n += p.length;
  return n;
}

/* One step of pipe drawing. `next` must be orthogonally adjacent to the
   current head. Returns true when the board changed (or the head simply
   advanced), false when the step is blocked. */
function tryStep(f, next) {
  const p = paths[f];
  const head = p[p.length - 1];
  if (next < 0 || next >= size * size) return false;
  const sameRow = Math.floor(next / size) === Math.floor(head / size);
  const diff = Math.abs(next - head);
  if (!(diff === size || (diff === 1 && sameRow))) return false;

  // dragging back along your own pipe retracts it
  if (p.length >= 2 && next === p[p.length - 2]) { p.pop(); return true; }
  // a finished pipe only retracts, never extends
  if (isComplete(f)) return false;
  // crossing your own pipe cuts the loop back to that cell
  const own = p.indexOf(next);
  if (own >= 0) { p.length = own + 1; return true; }

  const d = dotAt.get(next);
  if (d !== undefined) {
    if (d === f) { p.push(next); return true; }  // reached the matching dot
    return false;                                // other colours' dots block
  }

  // crossing another pipe severs it from that cell onward
  const occ = occupantAt(next);
  if (occ) paths[occ.flow].length = occ.index;
  p.push(next);
  return true;
}

/* Walk the head toward the pointer one cell at a time, preferring the
   dominant axis, falling back to the other, stopping when blocked. */
function stepToward(target) {
  let guard = size * 4;
  let changedAny = false;
  while (guard-- > 0) {
    const p = paths[drawingFlow];
    const head = p[p.length - 1];
    if (head === target) break;
    const hr = Math.floor(head / size), hc = head % size;
    const tr = Math.floor(target / size), tc = target % size;
    const dr = tr - hr, dc = tc - hc;
    const vStep = dr ? head + Math.sign(dr) * size : null;
    const hStep = dc ? head + Math.sign(dc) : null;
    const tries = Math.abs(dr) >= Math.abs(dc) ? [vStep, hStep] : [hStep, vStep];
    let stepped = false;
    for (const nxt of tries) {
      if (nxt !== null && tryStep(drawingFlow, nxt)) { stepped = true; changedAny = true; break; }
    }
    if (!stepped) break;
  }
  if (changedAny) {
    markChanged();
    render();
    updateHUD();
  }
}

/* ═══════════════════════════════════════════
   UNDO
═══════════════════════════════════════════ */
function snapshotPaths() {
  return { paths: paths.map(p => p.slice()), moves };
}

function pushUndo(snap) {
  undoStack.push(snap || snapshotPaths());
  if (undoStack.length > 60) undoStack.shift();
  updateUndoBtn();
}

function markChanged() {
  if (strokeChanged) return;
  strokeChanged = true;
  pushUndo(pendingSnapshot);
  pendingSnapshot = null;
  ensureTimer();
}

function undo() {
  if (gameOver || !undoStack.length) return;
  const s = undoStack.pop();
  paths = s.paths.map(p => p.slice());
  moves = s.moves;
  drawingFlow = null;
  updateUndoBtn();
  afterChange();
}

function updateUndoBtn() {
  $('#undoBtn').style.opacity = undoStack.length && !gameOver ? '1' : '0.4';
}

/* ═══════════════════════════════════════════
   HINT — snap one flow to its generated solution path, severing any
   pipes in the way (partition ⇒ the solution cells never contain
   another flow's dots, so the cuts always land mid-pipe).
═══════════════════════════════════════════ */
function sameCells(p, cells) {
  if (p.length !== cells.length) return false;
  const set = new Set(p);
  return cells.every(c => set.has(c));
}

function applyHint() {
  if (gameOver) return;
  let target = -1;
  for (let f = 0; f < flows.length; f++) if (!isComplete(f)) { target = f; break; }
  if (target < 0) {
    for (let f = 0; f < flows.length; f++) if (!sameCells(paths[f], flows[f].cells)) { target = f; break; }
  }
  if (target < 0) return;

  pushUndo();
  paths[target] = [];
  for (const cell of flows[target].cells) {
    const occ = occupantAt(cell);
    if (occ) paths[occ.flow].length = occ.index;
  }
  paths[target] = flows[target].cells.slice();
  moves++;
  hintsUsed++;
  ensureTimer();
  afterChange();
}

/* ═══════════════════════════════════════════
   WIN CHECK
═══════════════════════════════════════════ */
function checkWin() {
  if (gameOver) return;
  const connected = countConnected();
  const covered = coveredCells();
  const area = size * size;
  if (connected === flows.length && (!cfg.requireFill || covered === area)) {
    endGame();
    return;
  }
  if (connected === flows.length && cfg.requireFill) {
    if (!allConnectedToastShown) {
      allConnectedToastShown = true;
      showToast(`All pairs connected — cover the last ${area - covered} cell${area - covered === 1 ? '' : 's'} to solve.`);
    }
  } else {
    allConnectedToastShown = false;
  }
}

function endGame() {
  gameOver = true;
  clearInterval(timerInterval);
  drawingFlow = null;
  updateUndoBtn();

  const ts = formatTime(seconds);
  const perfect = hintsUsed === 0 && moves === flows.length;
  const key = bestKey();
  const best = loadJSON('freeflow-best', {});
  const prev = best[key];
  if (hintsUsed === 0 && (!prev || seconds < prev)) {
    best[key] = seconds;
    saveJSON('freeflow-best', best);
  }
  const improved = hintsUsed === 0 && (!prev || seconds <= prev);

  $('#overlayTitle').textContent = perfect ? '🌟 Perfect!' : '🎉 Solved!';
  let msg = `Cleared ${size}×${size} in ${ts} with ${moves} move${moves === 1 ? '' : 's'}`;
  if (perfect) msg += ' — every flow in one stroke!';
  else if (hintsUsed) msg += ` (${hintsUsed} hint${hintsUsed === 1 ? '' : 's'}).`;
  else msg += '.';
  if (hintsUsed === 0) {
    msg += improved && prev ? ' New best time!' : ` Best: ${formatTime(best[key])}.`;
  }
  $('#overlayMsg').textContent = msg;
  setTimeout(() => $('#overlay').classList.add('show'), 350);
  render();
  updateHUD();
  saveGameState();
}

/* ═══════════════════════════════════════════
   RENDERING (canvas)
═══════════════════════════════════════════ */
function boardAlpha() {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--board-alpha').trim();
  const v = parseFloat(raw);
  return isNaN(v) ? 1 : v / 100;
}

function hexToRgb(hex) {
  hex = hex.trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return null;
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function withAlpha(hex, a) {
  const rgb = hexToRgb(hex) || [128, 128, 128];
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a})`;
}

function isLightBoard() {
  if (cfg.classicBoard) return false;
  const rgb = hexToRgb(getComputedStyle(document.documentElement).getPropertyValue('--cell-empty'));
  if (!rgb) return false;
  return (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255 > 0.6;
}

function boardChrome() {
  const alpha = boardAlpha();
  const hi = document.documentElement.getAttribute('data-contrast') === 'high';
  if (cfg.classicBoard) {
    return {
      bg: `rgba(0, 0, 0, ${alpha})`,
      line: `rgba(255, 255, 255, ${(hi ? 0.3 : 0.14) * alpha})`,
    };
  }
  const surf = hexToRgb(getComputedStyle(document.documentElement).getPropertyValue('--surface3')) || [128, 128, 128];
  return {
    bg: null,  // the .board element paints the themed background
    line: `rgba(${surf[0]}, ${surf[1]}, ${surf[2]}, ${(hi ? 0.95 : 0.6) * alpha})`,
  };
}

function updateCanvasSize() {
  cssSize = board.clientWidth;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(cssSize * dpr));
  canvas.height = canvas.width;
}

function render() {
  if (!cssSize) updateCanvasSize();
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssSize, cssSize);

  const chrome = boardChrome();
  const cell = cssSize / size;
  const light = isLightBoard();

  if (chrome.bg) { ctx.fillStyle = chrome.bg; ctx.fillRect(0, 0, cssSize, cssSize); }

  ctx.strokeStyle = chrome.line;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i < size; i++) {
    const at = Math.round(i * cell) + 0.5;
    ctx.moveTo(at, 0); ctx.lineTo(at, cssSize);
    ctx.moveTo(0, at); ctx.lineTo(cssSize, at);
  }
  ctx.stroke();

  const cx = c => (c % size + 0.5) * cell;
  const cy = c => (Math.floor(c / size) + 0.5) * cell;

  // cell tints under each pipe
  for (let f = 0; f < flows.length; f++) {
    const p = paths[f];
    if (!p.length) continue;
    ctx.fillStyle = withAlpha(flowColor(f, light), 0.16);
    for (const c of p) {
      ctx.fillRect((c % size) * cell + 1, Math.floor(c / size) * cell + 1, cell - 2, cell - 2);
    }
  }

  // pipes
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let f = 0; f < flows.length; f++) {
    const p = paths[f];
    if (p.length < 2) continue;
    ctx.strokeStyle = flowColor(f, light);
    ctx.lineWidth = cell * 0.32;
    ctx.beginPath();
    ctx.moveTo(cx(p[0]), cy(p[0]));
    for (let j = 1; j < p.length; j++) ctx.lineTo(cx(p[j]), cy(p[j]));
    ctx.stroke();
  }

  // dots
  for (let f = 0; f < flows.length; f++) {
    const color = flowColor(f, light);
    const done = isComplete(f);
    for (const c of flowEnds(f)) {
      ctx.save();
      if (done) { ctx.shadowColor = color; ctx.shadowBlur = cell * 0.45; }
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx(c), cy(c), cell * 0.34, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // halo under the active drag head
  if (drawingFlow !== null && paths[drawingFlow].length) {
    const head = paths[drawingFlow][paths[drawingFlow].length - 1];
    ctx.fillStyle = withAlpha(flowColor(drawingFlow, light), 0.25);
    ctx.beginPath();
    ctx.arc(cx(head), cy(head), cell * 0.55, 0, Math.PI * 2);
    ctx.fill();
  }
}

function updateHUD() {
  $('#flowsStat').textContent = `${countConnected()}/${flows.length}`;
  $('#pipeStat').textContent = Math.floor(100 * coveredCells() / (size * size)) + '%';
  $('#movesStat').textContent = moves;
  $('#timer').textContent = formatTime(seconds);
}

function applyBoardStyle() {
  board.classList.toggle('classic', cfg.classicBoard);
}

/* ═══════════════════════════════════════════
   TIMER — starts on the first pipe you draw, not on page load
═══════════════════════════════════════════ */
function ensureTimer() {
  if (timerStarted || gameOver) return;
  timerStarted = true;
  startTimer();
}

function startTimer() {
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    seconds++;
    $('#timer').textContent = formatTime(seconds);
  }, 1000);
}

/* ═══════════════════════════════════════════
   TOAST
═══════════════════════════════════════════ */
let toastTimer = null;
function showToast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ═══════════════════════════════════════════
   NEW GAME
═══════════════════════════════════════════ */
function startGame() {
  size = activeSize();
  const puzzle = FlowEngine.generate({ size, difficulty: cfg.difficulty });
  flows = puzzle.flows;
  dotAt = new Map();
  for (let f = 0; f < flows.length; f++) {
    for (const c of flowEnds(f)) dotAt.set(c, f);
  }
  paths = flows.map(() => []);
  moves = 0; hintsUsed = 0;
  seconds = 0; timerStarted = false;
  clearInterval(timerInterval);
  gameOver = false;
  drawingFlow = null;
  undoStack = [];
  allConnectedToastShown = false;

  applyBoardStyle();
  updateCanvasSize();
  render();
  updateHUD();
  updateUndoBtn();
  $('#overlay').classList.remove('show');
  saveGameState();
}

function afterChange() {
  render();
  updateHUD();
  saveGameState();
  checkWin();
}

/* ═══════════════════════════════════════════
   POINTER INTERACTION
═══════════════════════════════════════════ */
function cellFromEvent(e) {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width) return -1;
  const x = (e.clientX - rect.left) / rect.width;
  const y = (e.clientY - rect.top) / rect.height;
  if (x < 0 || x >= 1 || y < 0 || y >= 1) return -1;
  return Math.floor(y * size) * size + Math.floor(x * size);
}

canvas.addEventListener('pointerdown', e => {
  if (gameOver) return;
  const cell = cellFromEvent(e);
  if (cell < 0) return;

  let f = -1;
  const d = dotAt.get(cell);
  const occ = d === undefined ? occupantAt(cell) : null;
  if (d !== undefined) f = d;
  else if (occ) f = occ.flow;
  if (f < 0) return;

  try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
  drawingFlow = f;
  strokeChanged = false;
  pendingSnapshot = snapshotPaths();

  if (d !== undefined) {
    // touching a dot restarts that flow from this end
    if (paths[f].length !== 1 || paths[f][0] !== cell) {
      paths[f] = [cell];
      markChanged();
    } else {
      paths[f] = [cell];
    }
  } else if (occ.index < paths[f].length - 1) {
    // touching mid-pipe cuts it back to that cell
    paths[f].length = occ.index + 1;
    markChanged();
  }
  render();
  updateHUD();
  e.preventDefault();
});

canvas.addEventListener('pointermove', e => {
  if (drawingFlow === null || gameOver) return;
  const cell = cellFromEvent(e);
  if (cell < 0) return;
  stepToward(cell);
});

function endStroke() {
  if (drawingFlow === null) return;
  drawingFlow = null;
  pendingSnapshot = null;
  if (strokeChanged) {
    moves++;
    strokeChanged = false;
    afterChange();
  } else {
    render();
  }
}

canvas.addEventListener('pointerup', endStroke);
canvas.addEventListener('pointercancel', endStroke);

/* ═══════════════════════════════════════════
   MAIN BUTTONS
═══════════════════════════════════════════ */
$('#newGameBtn').addEventListener('click', startGame);
$('#overlayBtn').addEventListener('click', startGame);
$('#undoBtn').addEventListener('click', undo);
$('#hintBtn').addEventListener('click', applyHint);

$('#difficultySelect').addEventListener('change', () => {
  cfg.difficulty = $('#difficultySelect').value;
  saveCfg();
  startGame();
});

/* ═══════════════════════════════════════════
   SETTINGS PANEL
   Open/close and its wiring are shared (see js/theme.js). syncSettingsUI()
   below is invoked automatically when the panel opens.
═══════════════════════════════════════════ */
function onToggle(id, key, extra) {
  $('#' + id).addEventListener('change', e => {
    cfg[key] = e.target.checked;
    saveCfg();
    if (extra) extra();
  });
}
onToggle('togClassic', 'classicBoard', () => { applyBoardStyle(); render(); });
onToggle('togFill', 'requireFill', () => { allConnectedToastShown = false; checkWin(); });

$$('#sizePicker .strike-opt').forEach(opt => {
  opt.addEventListener('click', () => {
    const v = +opt.dataset.val;
    if (v === cfg.boardSize) return;
    cfg.boardSize = v;
    saveCfg();
    syncSettingsUI();
    startGame();
  });
});

function syncSettingsUI() {
  $('#togClassic').checked = cfg.classicBoard;
  $('#togFill').checked = cfg.requireFill;
  $('#difficultySelect').value = cfg.difficulty;
  $$('#sizePicker .strike-opt').forEach(opt => {
    opt.classList.toggle('active', +opt.dataset.val === cfg.boardSize);
  });
  const auto = (FlowEngine.LEVELS[cfg.difficulty] || FlowEngine.LEVELS.medium).size;
  $('#sizeHint').textContent =
    `Auto follows difficulty (currently ${auto}×${auto}). Changing size starts a new board.`;
}

/* ═══════════════════════════════════════════
   PERSIST / RESTORE
═══════════════════════════════════════════ */
function saveGameState() {
  pushHistory('freeflow-history', {
    difficulty: cfg.difficulty,
    size,
    flows: flows.map(f => f.cells),
    paths: paths.map(p => p.slice()),
    moves, hintsUsed, seconds, timerStarted, gameOver,
  }, 2);
}

function restoreFreeFlow() {
  const history = loadJSON('freeflow-history', []);
  if (!history.length) return false;
  const s = history[history.length - 1];
  if (!s || !s.size || !Array.isArray(s.flows) || !Array.isArray(s.paths)) return false;
  if (s.paths.length !== s.flows.length) return false;

  cfg.difficulty = s.difficulty || cfg.difficulty;
  size = s.size;
  flows = s.flows.map((cells, id) => ({ id, cells }));
  dotAt = new Map();
  for (let f = 0; f < flows.length; f++) {
    for (const c of flowEnds(f)) dotAt.set(c, f);
  }
  paths = s.paths.map(p => p.slice());
  moves = s.moves || 0;
  hintsUsed = s.hintsUsed || 0;
  seconds = s.seconds || 0;
  timerStarted = !!s.timerStarted;
  gameOver = !!s.gameOver;
  undoStack = [];

  $('#difficultySelect').value = cfg.difficulty;
  applyBoardStyle();
  updateCanvasSize();
  render();
  updateHUD();
  updateUndoBtn();
  if (!gameOver && timerStarted) startTimer();
  if (gameOver) setTimeout(() => $('#overlay').classList.add('show'), 100);
  return true;
}

/* ═══════════════════════════════════════════
   RESIZE + THEME REDRAW
   The canvas snapshots theme tokens at draw time, so redraw whenever the
   theme attribute, contrast attribute, or the inline --board-alpha /
   --bg-image style on <html> changes.
═══════════════════════════════════════════ */
window.addEventListener('resize', () => {
  updateCanvasSize();
  render();
});

new MutationObserver(() => render()).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ['data-theme', 'data-contrast', 'style'],
});

/* ═══════════════════════════════════════════
   KICK OFF
═══════════════════════════════════════════ */
if (!restoreFreeFlow()) startGame();
