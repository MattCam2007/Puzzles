/* ═══════════════════════════════════════════
   SETTINGS STATE  (persisted to localStorage)
═══════════════════════════════════════════ */
const DEFAULTS = {
  difficulty:    'intermediate',
  customCols:    16,
  customRows:    16,
  customMines:   40,
  questionMarks: true,
  safeFirst:     true,
  chording:      true,
  longPressFlag: true,
  longPressMs:   450,
  useKeyboard:   true,
};

let cfg = Object.assign({}, DEFAULTS, loadJSON('minesweeper-cfg', {}));
function saveCfg() { saveJSON('minesweeper-cfg', cfg); }

/* ═══════════════════════════════════════════
   CLASSIC LEVELS  (used as the base defaults for Custom too)
═══════════════════════════════════════════ */
const LEVELS = {
  beginner:     { cols: 9,  rows: 9,  mines: 10 },
  intermediate: { cols: 16, rows: 16, mines: 40 },
  expert:       { cols: 30, rows: 16, mines: 99 },
};

/* board-size bounds for custom games */
const SIZE_MIN = 5, SIZE_MAX = 40;

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/* Resolve the active board dimensions. For 'custom', pull sanitized values
   from cfg; otherwise use the matching classic level. */
function currentLevel() {
  if (cfg.difficulty === 'custom') {
    const c = clamp(Math.round(cfg.customCols) || SIZE_MIN, SIZE_MIN, SIZE_MAX);
    const r = clamp(Math.round(cfg.customRows) || SIZE_MIN, SIZE_MIN, SIZE_MAX);
    // leave at least one safe (non-mine) cell; safe-first needs 9 for the
    // opening area but 1 keeps a degenerate board playable.
    const m = clamp(Math.round(cfg.customMines) || 1, 1, c * r - 1);
    return { cols: c, rows: r, mines: m };
  }
  return LEVELS[cfg.difficulty] || LEVELS.intermediate;
}

/* Best-time bucket key: custom boards are tracked per exact size. */
function bestKey() {
  if (cfg.difficulty === 'custom') return `custom-${cols}x${rows}-${totalMines}`;
  return cfg.difficulty;
}

/* ═══════════════════════════════════════════
   GAME STATE
═══════════════════════════════════════════ */
let cols, rows, totalMines;
let mineSet;          // Set of flat indices
let counts;           // Int8Array: -1=mine, 0-8=count
let cellState;        // Uint8Array: 0=covered,1=revealed,2=flag,3=question
let gameOver, win, firstClickDone;
let flagCount, revealedCount;
let seconds, timerInterval;
let cursor = null;    // [r,c] keyboard cursor
let flagMode = false; // tap-to-flag toggle
let explodedIdx = -1; // index of the mine that was struck (for red highlight)

/* ═══════════════════════════════════════════
   ENGINE
═══════════════════════════════════════════ */
function idx(r, c) { return r * cols + c; }

function neighbors(i) {
  const r = Math.floor(i / cols), c = i % cols;
  const out = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) out.push(idx(nr, nc));
    }
  }
  return out;
}

function placeMines(safeIdx) {
  mineSet = new Set();
  const pool = [];
  for (let i = 0; i < cols * rows; i++) {
    if (i !== safeIdx) pool.push(i);
  }
  const shuffled = shuffle(pool);
  for (let i = 0; i < totalMines; i++) mineSet.add(shuffled[i]);

  counts = new Int8Array(cols * rows);
  for (let i = 0; i < cols * rows; i++) {
    if (mineSet.has(i)) { counts[i] = -1; continue; }
    let n = 0;
    for (const nb of neighbors(i)) if (mineSet.has(nb)) n++;
    counts[i] = n;
  }
}

function floodReveal(startIdx) {
  const stack = [startIdx];
  while (stack.length) {
    const i = stack.pop();
    if (cellState[i] !== 0) continue; // already revealed or flagged
    cellState[i] = 1;
    revealedCount++;
    if (counts[i] === 0) {
      for (const nb of neighbors(i)) {
        if (cellState[nb] === 0) stack.push(nb);
      }
    }
  }
}

function revealCell(i) {
  if (gameOver) return;
  if (cellState[i] === 2 || cellState[i] === 3) return; // flagged/question, do nothing
  if (cellState[i] === 1) {
    // already revealed — try chord / highlight
    if (cfg.chording) pressNumber(i);
    return;
  }

  // first reveal — place mines deferred for safety
  if (!firstClickDone) {
    firstClickDone = true;
    if (cfg.safeFirst) {
      placeMines(i);
    } else {
      // mines already placed at game start; classic relocation if needed
      if (mineSet.has(i)) {
        mineSet.delete(i);
        for (let j = 0; j < cols * rows; j++) {
          if (!mineSet.has(j) && j !== i) { mineSet.add(j); break; }
        }
        recomputeCounts();
      }
    }
    startTimer();
  }

  if (mineSet.has(i)) {
    // detonated
    cellState[i] = 1;
    endGame(false, i);
    return;
  }

  if (counts[i] === 0) {
    floodReveal(i);
  } else {
    cellState[i] = 1;
    revealedCount++;
  }

  checkWin();
  renderBoard();
  saveGameState();
  updateHUD();
}

/* Pressing a revealed number: if its mines are all accounted for by adjacent
   flags, clear the remaining neighbours (chord). Otherwise, highlight the
   covered neighbours that still need to be resolved for that number. */
function pressNumber(i) {
  if (counts[i] <= 0) return;
  const nbs = neighbors(i);
  const adjFlags = nbs.filter(nb => cellState[nb] === 2).length;
  if (adjFlags === counts[i]) {
    chordCell(i);
  } else {
    highlightRemaining(i);
  }
}

let highlightTimer = null;

/* Briefly highlight the still-covered neighbours of a number whose mines are
   not yet fully flagged. Uses the theme accent via the .remaining class. */
function highlightRemaining(i) {
  clearHighlights();
  const board = $('#board');
  for (const nb of neighbors(i)) {
    if (cellState[nb] === 0 || cellState[nb] === 3) {
      const el = board.children[nb];
      if (el) el.classList.add('remaining');
    }
  }
  highlightTimer = setTimeout(clearHighlights, 1400);
}

function clearHighlights() {
  clearTimeout(highlightTimer);
  highlightTimer = null;
  $$('.cell.remaining', $('#board')).forEach(el => el.classList.remove('remaining'));
}

function chordCell(i) {
  if (counts[i] <= 0) return;
  const nbs = neighbors(i);
  const adjFlags = nbs.filter(nb => cellState[nb] === 2).length;
  if (adjFlags !== counts[i]) return;
  clearHighlights();

  let hitMine = false, explodeIdx = -1;
  for (const nb of nbs) {
    if (cellState[nb] === 0 || cellState[nb] === 3) {
      if (mineSet.has(nb)) { hitMine = true; explodeIdx = nb; }
      else {
        if (counts[nb] === 0) floodReveal(nb);
        else { cellState[nb] = 1; revealedCount++; }
      }
    }
  }

  if (hitMine) {
    endGame(false, explodeIdx);
    return;
  }
  checkWin();
  renderBoard();
  saveGameState();
  updateHUD();
}

function recomputeCounts() {
  counts = new Int8Array(cols * rows);
  for (let i = 0; i < cols * rows; i++) {
    if (mineSet.has(i)) { counts[i] = -1; continue; }
    let n = 0;
    for (const nb of neighbors(i)) if (mineSet.has(nb)) n++;
    counts[i] = n;
  }
}

function toggleFlag(i) {
  if (gameOver) return;
  if (cellState[i] === 1) return; // revealed, ignore
  if (!firstClickDone) return;    // no flagging before first reveal

  if (cellState[i] === 0) {
    cellState[i] = 2; flagCount++;
  } else if (cellState[i] === 2) {
    flagCount--;
    cellState[i] = cfg.questionMarks ? 3 : 0;
  } else if (cellState[i] === 3) {
    cellState[i] = 0;
  }

  renderCell(i);
  updateHUD();
  saveGameState();
}

function checkWin() {
  if (revealedCount === cols * rows - totalMines) {
    // auto-flag remaining mines
    for (let i = 0; i < cols * rows; i++) {
      if (mineSet.has(i) && cellState[i] !== 2) { cellState[i] = 2; flagCount++; }
    }
    endGame(true, -1);
  }
}

function endGame(won, explodeIdx) {
  gameOver = true;
  win = won;
  explodedIdx = explodeIdx;
  clearInterval(timerInterval);

  if (!won) {
    // reveal all mines, mark wrong flags
    for (let i = 0; i < cols * rows; i++) {
      if (mineSet.has(i) && cellState[i] !== 2) cellState[i] = 1; // reveal unflagged mines
      if (!mineSet.has(i) && cellState[i] === 2) cellState[i] = 4; // wrong flag marker
    }
  }

  renderBoard(explodeIdx);
  updateHUD();

  const face = $('#faceBtn');
  face.textContent = won ? '😎' : '😵';

  const ts = formatTime(seconds);
  if (won) {
    const key = bestKey();
    const best = loadJSON('minesweeper-best', {});
    const prev = best[key];
    if (!prev || seconds < prev) {
      best[key] = seconds;
      saveJSON('minesweeper-best', best);
    }
    const newBest = best[key];
    const improved = !prev || seconds <= prev;
    $('#overlayTitle').textContent = '🎉 Cleared!';
    $('#overlayMsg').textContent = `Solved in ${ts}${improved && prev ? ' — new best!' : '. Best: ' + formatTime(newBest)}`;
    // win: celebratory full overlay is fine
    setTimeout(() => $('#overlay').classList.add('show'), 400);
  } else {
    // loss: show a non-covering banner so the board stays visible to study.
    // The board is already deactivated (gameOver guards all input).
    $('#bannerSub').textContent = `You hit a mine after ${ts}. The mine you struck is in red — study the board, then start again.`;
    $('#banner').classList.add('show');
  }

  saveGameState();
}

/* ═══════════════════════════════════════════
   RENDERING
═══════════════════════════════════════════ */
function cellContent(i) {
  const s = cellState[i];
  if (s === 2) return '🚩';
  if (s === 3) return '❓';
  if (s === 4) return '🚩'; // wrong flag — shown with wrong-flag class
  if (s === 1) {
    if (mineSet.has(i)) return '💣';
    const c = counts[i];
    return c > 0 ? String(c) : '';
  }
  return '';
}

function cellClasses(i, explodeIdx) {
  const s = cellState[i];
  const cls = ['cell'];
  if (s === 0 || s === 3) cls.push('covered');
  if (s === 3) cls.push('question');
  if (s === 2) cls.push('covered', 'flag');
  if (s === 4) cls.push('covered', 'flag', 'wrong-flag');
  if (s === 1) {
    cls.push('revealed');
    if (mineSet.has(i)) {
      cls.push('mine');
      if (i === explodeIdx) cls.push('exploded');
    } else {
      const c = counts[i];
      if (c > 0) cls.push('n' + c);
    }
  }
  if (cursor !== null && i === idx(cursor[0], cursor[1])) cls.push('cursor');
  return cls.join(' ');
}

function renderBoard(explodeIdx = -1) {
  const board = $('#board');
  board.innerHTML = '';
  for (let i = 0; i < cols * rows; i++) {
    const cell = document.createElement('div');
    cell.className = cellClasses(i, explodeIdx);
    cell.dataset.i = i;
    cell.textContent = cellContent(i);
    board.appendChild(cell);
  }
}

function renderCell(i) {
  const board = $('#board');
  const el = board.children[i];
  if (!el) return;
  el.className = cellClasses(i, -1);
  el.textContent = cellContent(i);
}

function updateCellSize() {
  const wrap = $('#boardWrap');
  if (!wrap) return;
  const avail = wrap.clientWidth - 4; // minus board border
  const cellPx = Math.max(16, Math.floor(avail / cols));
  document.documentElement.style.setProperty('--cell', cellPx + 'px');
  document.documentElement.style.setProperty('--cols', cols);
  document.documentElement.style.setProperty('--rows', rows);
}

function updateHUD() {
  $('#mineCount').textContent = totalMines - flagCount;
  const best = loadJSON('minesweeper-best', {});
  const b = best[bestKey()];
  $('#bestTime').textContent = b !== undefined ? formatTime(b) : '—';
  $('#timer').textContent = formatTime(seconds);
}

/* ═══════════════════════════════════════════
   TIMER
═══════════════════════════════════════════ */
function startTimer() {
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    seconds++;
    $('#timer').textContent = formatTime(seconds);
  }, 1000);
}

/* ═══════════════════════════════════════════
   NEW GAME
═══════════════════════════════════════════ */
function startGame() {
  const level = currentLevel();
  cols = level.cols; rows = level.rows; totalMines = level.mines;

  cellState = new Uint8Array(cols * rows);
  counts    = new Int8Array(cols * rows);
  mineSet   = new Set();
  flagCount = 0; revealedCount = 0;
  firstClickDone = false;
  gameOver = false; win = false;
  explodedIdx = -1;
  seconds = 0;
  cursor = null;
  clearInterval(timerInterval);

  // pre-place mines only if !safeFirst (so we can still relocate on first click)
  if (!cfg.safeFirst) {
    const allIdx = shuffle([...Array(cols * rows).keys()]);
    for (let i = 0; i < totalMines; i++) mineSet.add(allIdx[i]);
    recomputeCounts();
  }

  updateCellSize();
  renderBoard();
  updateHUD();
  $('#timer').textContent = '0:00';
  $('#faceBtn').textContent = '🙂';
  $('#overlay').classList.remove('show');
  $('#banner').classList.remove('show');
  applySettingsToUI();
}

/* ═══════════════════════════════════════════
   POINTER INTERACTION
═══════════════════════════════════════════ */
let longPressTimer = null;
let longPressFired = false;
let lastPointerType = 'mouse';
let pointerStartX = 0, pointerStartY = 0;
const DRAG_THRESHOLD = 6; // px

function cellIdxFromEvent(e) {
  const el = e.target.closest('.cell');
  if (!el) return -1;
  return parseInt(el.dataset.i, 10);
}

$('#board').addEventListener('pointerdown', e => {
  if (gameOver) return;
  const i = cellIdxFromEvent(e);
  if (i < 0) return;

  // defensively clear any stale timer so one hold can't start two
  clearTimeout(longPressTimer);
  longPressTimer = null;

  lastPointerType = e.pointerType;
  pointerStartX = e.clientX;
  pointerStartY = e.clientY;
  longPressFired = false;

  if (e.pointerType !== 'mouse' && cfg.longPressFlag) {
    longPressTimer = setTimeout(() => {
      longPressFired = true;
      toggleFlag(i);
    }, cfg.longPressMs);
  }

  if (e.button === 0 && !gameOver) {
    $('#faceBtn').textContent = '😮';
  }
});

$('#board').addEventListener('pointermove', e => {
  if (longPressTimer === null) return;
  const dx = e.clientX - pointerStartX, dy = e.clientY - pointerStartY;
  if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
});

$('#board').addEventListener('pointercancel', () => {
  clearTimeout(longPressTimer);
  longPressTimer = null;
  if (!gameOver) $('#faceBtn').textContent = '🙂';
});

$('#board').addEventListener('pointerup', () => {
  clearTimeout(longPressTimer);
  longPressTimer = null;
  if (!gameOver) $('#faceBtn').textContent = win ? '😎' : '🙂';
});

$('#board').addEventListener('click', e => {
  if (gameOver) return;
  if (longPressFired) { longPressFired = false; return; } // long-press already handled
  const i = cellIdxFromEvent(e);
  if (i < 0) return;
  if (flagMode) { toggleFlag(i); return; }
  revealCell(i);
});

// right-click = flag, scoped to board only.
// On touch/pen a long press also emits a native contextmenu event; that case is
// already handled by the long-press timer, so only act on it for the mouse —
// otherwise one hold would toggle twice and skip a state.
$('#board').addEventListener('contextmenu', e => {
  e.preventDefault();
  if (gameOver) return;
  if (lastPointerType !== 'mouse') return; // touch/pen handled by long-press timer
  const i = cellIdxFromEvent(e);
  if (i < 0) return;
  toggleFlag(i);
});

/* ═══════════════════════════════════════════
   KEYBOARD
═══════════════════════════════════════════ */
document.addEventListener('keydown', e => {
  if (!cfg.useKeyboard || gameOver) return;
  if (cursor === null) cursor = [0, 0];

  let [r, c] = cursor;
  switch (e.key) {
    case 'ArrowUp':    r = Math.max(0, r - 1); break;
    case 'ArrowDown':  r = Math.min(rows - 1, r + 1); break;
    case 'ArrowLeft':  c = Math.max(0, c - 1); break;
    case 'ArrowRight': c = Math.min(cols - 1, c + 1); break;
    case ' ': case 'Enter':
      revealCell(idx(r, c));
      e.preventDefault(); return;
    case 'f': case 'F':
      toggleFlag(idx(r, c)); return;
    default: return;
  }

  cursor = [r, c];
  e.preventDefault();
  // update cursor highlight without full re-render
  $$('.cell.cursor', $('#board')).forEach(el => el.classList.remove('cursor'));
  const el = $('#board').children[idx(r, c)];
  if (el) el.classList.add('cursor');
});

/* ═══════════════════════════════════════════
   FLAG MODE TOGGLE (touch-friendly)
═══════════════════════════════════════════ */
$('#flagModeBtn').addEventListener('click', () => {
  flagMode = !flagMode;
  $('#flagModeBtn').classList.toggle('active', flagMode);
});

/* ═══════════════════════════════════════════
   MAIN BUTTONS
═══════════════════════════════════════════ */
$('#newGameBtn').addEventListener('click', startGame);
$('#faceBtn').addEventListener('click', startGame);
$('#overlayBtn').addEventListener('click', startGame);
$('#bannerBtn').addEventListener('click', startGame);

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
onToggle('togQuestion',   'questionMarks');
onToggle('togSafeFirst',  'safeFirst');
onToggle('togChord',      'chording');
onToggle('togLongPress',  'longPressFlag', applySettingsToUI);
onToggle('togKeyboard',   'useKeyboard', applySettingsToUI);

/* hold-time-to-flag picker */
$$('#flagDelayPicker .strike-opt').forEach(opt => {
  opt.addEventListener('click', () => {
    cfg.longPressMs = +opt.dataset.val;
    saveCfg();
    syncSettingsUI();
  });
});

/* ── CUSTOM BOARD SIZE ──
   Editing any field switches difficulty to Custom, persists, and starts a
   fresh game at the new dimensions. */
function commitCustomSize() {
  const c = clamp(parseInt($('#customCols').value, 10)  || SIZE_MIN, SIZE_MIN, SIZE_MAX);
  const r = clamp(parseInt($('#customRows').value, 10)  || SIZE_MIN, SIZE_MIN, SIZE_MAX);
  const maxMines = c * r - 1;
  const m = clamp(parseInt($('#customMines').value, 10) || 1, 1, maxMines);

  cfg.customCols = c;
  cfg.customRows = r;
  cfg.customMines = m;
  cfg.difficulty = 'custom';
  saveCfg();
  syncSettingsUI();
  $('#difficultySelect').value = 'custom';
  startGame();
}

['customCols', 'customRows', 'customMines'].forEach(id => {
  $('#' + id).addEventListener('change', commitCustomSize);
});

function applySettingsToUI() {
  $('#difficultySelect').value = cfg.difficulty;
  // hold-time picker is only relevant when long-press flagging is on
  const dim = cfg.longPressFlag ? '1' : '0.4';
  $('#flagDelayRow').style.opacity = dim;
  $('#flagDelayPicker').style.opacity = dim;
  $('#flagDelayPicker').style.pointerEvents = cfg.longPressFlag ? 'auto' : 'none';
}

function syncSettingsUI() {
  $('#togQuestion').checked  = cfg.questionMarks;
  $('#togSafeFirst').checked = cfg.safeFirst;
  $('#togChord').checked     = cfg.chording;
  $('#togLongPress').checked = cfg.longPressFlag;
  $('#togKeyboard').checked  = cfg.useKeyboard;
  $$('#flagDelayPicker .strike-opt').forEach(opt => {
    opt.classList.toggle('active', +opt.dataset.val === cfg.longPressMs);
  });
  $('#customCols').value  = cfg.customCols;
  $('#customRows').value  = cfg.customRows;
  $('#customMines').value = cfg.customMines;
  const maxMines = cfg.customCols * cfg.customRows - 1;
  $('#customMines').max = maxMines;
  $('#customSizeHint').textContent =
    `${SIZE_MIN}–${SIZE_MAX} per side · 1–${maxMines} mines. Editing switches to Custom.`;
}

/* ═══════════════════════════════════════════
   PERSIST / RESTORE
═══════════════════════════════════════════ */
function saveGameState() {
  pushHistory('minesweeper-history', {
    difficulty:     cfg.difficulty,
    cols, rows, totalMines,
    mineSet:        [...mineSet],
    counts:         [...counts],
    cellState:      [...cellState],
    flagCount, revealedCount,
    firstClickDone,
    gameOver, win, explodedIdx,
    seconds,
  }, 2);
}

function restoreMinesweeper() {
  const history = loadJSON('minesweeper-history', []);
  if (!history.length) return false;
  const s = history[history.length - 1];
  if (!s || !s.cellState) return false;

  cfg.difficulty = s.difficulty || cfg.difficulty;
  cols = s.cols; rows = s.rows; totalMines = s.totalMines;
  mineSet   = new Set(s.mineSet);
  counts    = new Int8Array(s.counts);
  cellState = new Uint8Array(s.cellState);
  flagCount    = s.flagCount;
  revealedCount = s.revealedCount;
  firstClickDone = s.firstClickDone;
  gameOver  = s.gameOver;
  win       = s.win;
  explodedIdx = s.explodedIdx ?? -1;
  seconds   = s.seconds || 0;
  cursor    = null;

  $('#difficultySelect').value = cfg.difficulty;
  updateCellSize();
  renderBoard(explodedIdx);
  updateHUD();
  $('#faceBtn').textContent = win ? '😎' : gameOver ? '😵' : '🙂';
  if (!gameOver && firstClickDone) startTimer();
  if (gameOver && win) {
    setTimeout(() => $('#overlay').classList.add('show'), 100);
  } else if (gameOver && !win) {
    $('#bannerSub').textContent = `You hit a mine after ${formatTime(seconds)}. The mine you struck is in red — study the board, then start again.`;
    $('#banner').classList.add('show');
  }
  applySettingsToUI();
  return true;
}

/* ═══════════════════════════════════════════
   RESIZE
═══════════════════════════════════════════ */
window.addEventListener('resize', () => {
  updateCellSize();
});

/* ═══════════════════════════════════════════
   KICK OFF
═══════════════════════════════════════════ */
if (!restoreMinesweeper()) startGame();
