/* ═══════════════════════════════════════════
   SETTINGS STATE  (persisted to localStorage)
═══════════════════════════════════════════ */
const DEFAULTS = {
  inputMode: 'number',    // 'cell' | 'number'
  highlight: true,
  sameNum: true,
  showHints: true,
  showCandidates: true,
  showExcluded: false,
  checkMistakes: true,
  showMistakeDots: true,
  strikeLimit: 3,         // 0 = unlimited
  useKeyboard: true,
  showNumpad: true,
};

let cfg = Object.assign({}, DEFAULTS, loadJSON('sudoku-cfg', {}));

function saveCfg() { saveJSON('sudoku-cfg', cfg); }

/* ═══════════════════════════════════════════
   SUDOKU ENGINE
═══════════════════════════════════════════ */
function generateSolved() {
  const board = Array.from({length:9}, () => Array(9).fill(0));
  fillBoard(board);
  return board;
}
function fillBoard(board) {
  const empty = findEmpty(board);
  if (!empty) return true;
  const [r,c] = empty;
  for (const n of shuffle([1,2,3,4,5,6,7,8,9])) {
    if (isValid(board,r,c,n)) {
      board[r][c] = n;
      if (fillBoard(board)) return true;
      board[r][c] = 0;
    }
  }
  return false;
}
function findEmpty(board) {
  for (let r=0;r<9;r++) for (let c=0;c<9;c++) if (!board[r][c]) return [r,c];
  return null;
}
function isValid(board,row,col,num) {
  if (board[row].includes(num)) return false;
  for (let r=0;r<9;r++) if (board[r][col]===num) return false;
  const br=Math.floor(row/3)*3, bc=Math.floor(col/3)*3;
  for (let r=br;r<br+3;r++) for (let c=bc;c<bc+3;c++) if (board[r][c]===num) return false;
  return true;
}
function countSolutions(board, limit=2) {
  const clone = board.map(r=>[...r]);
  let count = 0;
  function solve() {
    if (count>=limit) return;
    const empty = findEmpty(clone);
    if (!empty) { count++; return; }
    const [r,c] = empty;
    for (let n=1;n<=9;n++) {
      if (isValid(clone,r,c,n)) { clone[r][c]=n; solve(); clone[r][c]=0; }
    }
  }
  solve(); return count;
}
const CLUES = {easy:45, medium:36, hard:28, expert:22};
function makePuzzle(difficulty) {
  const solved = generateSolved();
  const puzzle = solved.map(r=>[...r]);
  const cells = shuffle([...Array(81).keys()]);
  const target = CLUES[difficulty]||36;
  let removed = 0;
  for (const idx of cells) {
    if (81-removed <= target) break;
    const r=Math.floor(idx/9), c=idx%9;
    const val = puzzle[r][c];
    puzzle[r][c] = 0;
    if (countSolutions(puzzle) !== 1) puzzle[r][c] = val;
    else removed++;
  }
  return {puzzle, solved};
}

// checks live board (given + player entries) — used for candidate highlighting
function isLegalPlacement(row, col, num) {
  for (let c=0;c<9;c++) {
    if (c===col) continue;
    const v = puzzle[row][c] || playerBoard[row][c];
    if (v===num) return false;
  }
  for (let r=0;r<9;r++) {
    if (r===row) continue;
    const v = puzzle[r][col] || playerBoard[r][col];
    if (v===num) return false;
  }
  const br=Math.floor(row/3)*3, bc=Math.floor(col/3)*3;
  for (let r=br;r<br+3;r++) for (let c=bc;c<bc+3;c++) {
    if (r===row && c===col) continue;
    const v = puzzle[r][c] || playerBoard[r][c];
    if (v===num) return false;
  }
  return true;
}

/* ═══════════════════════════════════════════
   GAME STATE
═══════════════════════════════════════════ */
let puzzle, solution, playerBoard, pencilMarks;
let selected = null;      // [r,c] for cell-first
let selectedNum = null;   // number for number-first
let pencilMode = false;
let mistakes = 0;
let timerInterval = null;
let seconds = 0;
let gameOver = false;
let hintsUsed = 0;

function startGame() {
  const diff = $('#difficultySelect').value;
  const data = makePuzzle(diff);
  puzzle = data.puzzle;
  solution = data.solved;
  playerBoard = puzzle.map(r=>r.map(v=>v));
  pencilMarks = Array.from({length:9}, ()=>Array.from({length:9}, ()=>new Set()));
  selected = null; selectedNum = null;
  mistakes = 0; hintsUsed = 0;
  gameOver = false; seconds = 0;
  clearInterval(timerInterval);
  timerInterval = setInterval(tickTimer, 1000);
  renderBoard(); renderNumpad();
  updateMistakeDots();
  $('#overlay').classList.remove('show');
  applySettingsToUI();
}

function tickTimer() {
  seconds++;
  $('#timer').textContent = formatTime(seconds);
}

/* ═══════════════════════════════════════════
   RENDERING
═══════════════════════════════════════════ */
function renderBoard() {
  const board = $('#board');
  board.innerHTML = '';
  for (let r=0;r<9;r++) {
    for (let c=0;c<9;c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.row = r; cell.dataset.col = c;
      const isGiven = puzzle[r][c] !== 0;
      const pv = playerBoard[r][c];
      const marks = pencilMarks[r][c];

      if (isGiven) {
        cell.classList.add('given');
        cell.textContent = puzzle[r][c];
      } else if (pv !== 0) {
        cell.textContent = pv;
        if (cfg.checkMistakes && pv !== solution[r][c]) cell.classList.add('error');
      } else if (marks.size > 0) {
        const grid = document.createElement('div');
        grid.className = 'pencil-grid';
        for (let n=1;n<=9;n++) {
          const m = document.createElement('div');
          m.className = 'pencil-mark' + (marks.has(n) ? ' visible' : '');
          m.textContent = n;
          grid.appendChild(m);
        }
        cell.appendChild(grid);
      }
      cell.addEventListener('pointerdown', () => handleCellTap(r, c));
      board.appendChild(cell);
    }
  }
  applyHighlights();
}

function applyHighlights() {
  const cells = $$('.cell');
  cells.forEach(cell => {
    cell.classList.remove('selected','numfirst-selected','box-hl','line-hl','same-number','candidate','excluded');
  });

  if (cfg.inputMode === 'cell' && selected) {
    const [sr,sc] = selected;
    const selVal = playerBoard[sr][sc] || puzzle[sr][sc];
    const boxR=Math.floor(sr/3)*3, boxC=Math.floor(sc/3)*3;
    cells.forEach(cell => {
      const r=+cell.dataset.row, c=+cell.dataset.col;
      if (r===sr && c===sc) { cell.classList.add('selected'); return; }
      if (cfg.highlight) {
        const inBox = r>=boxR&&r<boxR+3&&c>=boxC&&c<boxC+3;
        if (inBox) cell.classList.add('box-hl');
        else if (r===sr||c===sc) cell.classList.add('line-hl');
      }
      if (cfg.sameNum && selVal) {
        const cv = playerBoard[r][c] || puzzle[r][c];
        if (cv===selVal) cell.classList.add('same-number');
      }
    });
  }

  if (cfg.inputMode === 'number' && selectedNum) {
    cells.forEach(cell => {
      const r=+cell.dataset.row, c=+cell.dataset.col;
      const cv = playerBoard[r][c] || puzzle[r][c];
      // highlight existing placements of this number
      if (cfg.sameNum && cv===selectedNum) cell.classList.add('numfirst-selected');
      // candidate cells: empty, no conflict, not a given
      if (cfg.showCandidates && puzzle[r][c]===0 && playerBoard[r][c]===0 && isLegalPlacement(r, c, selectedNum)) {
        cell.classList.add('candidate');
      }
      // excluded cells: empty, has a conflict
      if (cfg.showExcluded && puzzle[r][c]===0 && playerBoard[r][c]===0 && !isLegalPlacement(r, c, selectedNum)) {
        cell.classList.add('excluded');
      }
    });
  }
}

function renderNumpad() {
  const numpad = $('#numpad');
  numpad.innerHTML = '';
  const counts = Array(10).fill(0);
  for (let r=0;r<9;r++) for (let c=0;c<9;c++) {
    const v = playerBoard[r][c] || puzzle[r][c];
    if (v) counts[v]++;
  }
  for (let n=1;n<=9;n++) {
    const btn = document.createElement('div');
    btn.className = 'num-btn';
    if (cfg.inputMode==='number' && selectedNum===n) btn.classList.add('num-selected');
    const remaining = 9-counts[n];
    const label = document.createElement('span');
    label.style.cssText = 'pointer-events:none';
    label.textContent = n;
    btn.appendChild(label);
    const badge = document.createElement('span');
    badge.className = 'count-badge';
    badge.textContent = remaining>0 ? remaining : '';
    btn.appendChild(badge);
    if (counts[n]>=9) btn.classList.add('completed-num');
    btn.addEventListener('pointerdown', () => handleNumTap(n));
    numpad.appendChild(btn);
  }
}

function updateMistakeDots() {
  const lim = cfg.strikeLimit || 99;
  for (let i=1;i<=3;i++) {
    const dot = $('#m'+i);
    if (dot) dot.classList.toggle('used', i<=mistakes);
  }
}

/* ═══════════════════════════════════════════
   INTERACTION — CELL & NUMBER TAPS
═══════════════════════════════════════════ */
function handleCellTap(r, c) {
  if (gameOver) return;

  if (cfg.inputMode === 'number') {
    // number-first: if a number is armed, fill/pencil this cell
    if (selectedNum !== null) {
      placeNumber(r, c, selectedNum);
    }
    // also select the cell for highlighting
    selected = [r, c];
    applyHighlights();
    return;
  }

  // cell-first
  selected = [r, c];
  applyHighlights();
}

function handleNumTap(n) {
  if (gameOver) return;

  if (cfg.inputMode === 'number') {
    if (selectedNum === n) {
      // tapping the same number deselects it
      selectedNum = null;
    } else {
      // switching to a new number — clear any lingering cell selection
      // so the new number doesn't fire into the last-touched cell
      selectedNum = n;
      selected = null;
    }
    renderNumpad();
    applyHighlights();
    return;
  }

  // cell-first: need selected cell
  if (!selected) return;
  placeNumber(selected[0], selected[1], n);
}

function placeNumber(r, c, n) {
  if (puzzle[r][c] !== 0) return; // given

  if (pencilMode) {
    if (playerBoard[r][c] !== 0) return;
    const marks = pencilMarks[r][c];
    if (marks.has(n)) marks.delete(n); else marks.add(n);
    renderBoard(); return;
  }

  // toggle off if same
  if (playerBoard[r][c] === n) {
    playerBoard[r][c] = 0;
  } else {
    playerBoard[r][c] = n;
    pencilMarks[r][c].clear();
    clearAffectedPencilMarks(r, c, n);

    if (cfg.checkMistakes && n !== solution[r][c]) {
      mistakes++;
      updateMistakeDots();
      const lim = cfg.strikeLimit;
      if (lim > 0 && mistakes >= lim) { endGame(false); return; }
    }
  }
  renderBoard(); renderNumpad(); checkWin();
}

function clearAffectedPencilMarks(row, col, num) {
  const br=Math.floor(row/3)*3, bc=Math.floor(col/3)*3;
  for (let i=0;i<9;i++) { pencilMarks[row][i].delete(num); pencilMarks[i][col].delete(num); }
  for (let r=br;r<br+3;r++) for (let c=bc;c<bc+3;c++) pencilMarks[r][c].delete(num);
}

function eraseCell() {
  if (gameOver) return;
  const target = selected;
  if (!target) return;
  const [r,c] = target;
  if (puzzle[r][c] !== 0) return;
  if (pencilMode) pencilMarks[r][c].clear();
  else { playerBoard[r][c]=0; pencilMarks[r][c].clear(); }
  renderBoard(); renderNumpad();
}

function giveHint() {
  if (gameOver || !cfg.showHints) return;
  const candidates = [];
  for (let r=0;r<9;r++) for (let c=0;c<9;c++)
    if (puzzle[r][c]===0 && playerBoard[r][c]!==solution[r][c]) candidates.push([r,c]);
  if (!candidates.length) return;
  let target = null;
  if (selected) {
    const [sr,sc]=selected;
    if (candidates.find(([r,c])=>r===sr&&c===sc)) target=[sr,sc];
  }
  if (!target) target = candidates[Math.floor(Math.random()*candidates.length)];
  const [r,c]=target;
  playerBoard[r][c]=solution[r][c];
  pencilMarks[r][c].clear();
  clearAffectedPencilMarks(r,c,solution[r][c]);
  hintsUsed++; selected=[r,c];
  renderBoard(); renderNumpad(); checkWin();
}

function checkWin() {
  for (let r=0;r<9;r++) for (let c=0;c<9;c++)
    if (playerBoard[r][c]!==solution[r][c]) return;
  endGame(true);
}

function endGame(won) {
  gameOver=true; clearInterval(timerInterval);
  const ts = formatTime(seconds);
  $('#overlayTitle').textContent = won ? '🎉 Solved!' : '💀 Game Over';
  $('#overlayMsg').textContent = won
    ? `Finished in ${ts} with ${mistakes} mistake${mistakes!==1?'s':''} and ${hintsUsed} hint${hintsUsed!==1?'s':''}.`
    : `You hit the ${cfg.strikeLimit}-strike limit. Better luck next time!`;
  $('#overlay').classList.add('show');
}

/* ═══════════════════════════════════════════
   SETTINGS → UI
═══════════════════════════════════════════ */
function applySettingsToUI() {
  // input mode badge
  const badge = $('#modeBadge');
  if (cfg.inputMode==='number') {
    badge.textContent = 'Num First'; badge.classList.add('numfirst');
  } else {
    badge.textContent = 'Cell First'; badge.classList.remove('numfirst');
  }

  // mistakes dots visibility
  const mwrap = $('#mistakesWrap');
  mwrap.style.display = (cfg.showMistakeDots && cfg.checkMistakes) ? 'flex' : 'none';

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

function syncSettingsUI() {
  $('#togHighlight').checked = cfg.highlight;
  $('#togSameNum').checked = cfg.sameNum;
  $('#togHints').checked = cfg.showHints;
  $('#togCandidates').checked = cfg.showCandidates;
  $('#togExcluded').checked = cfg.showExcluded;
  $('#togCheckMistakes').checked = cfg.checkMistakes;
  $('#togMistakeDots').checked = cfg.showMistakeDots;
  $('#togKeyboard').checked = cfg.useKeyboard;
  $('#togNumpad').checked = cfg.showNumpad;

  $('#segCell').classList.toggle('active', cfg.inputMode==='cell');
  $('#segNumber').classList.toggle('active', cfg.inputMode==='number');

  $$('.strike-opt').forEach(opt => {
    opt.classList.toggle('active', +opt.dataset.val === cfg.strikeLimit);
  });
}

/* ═══════════════════════════════════════════
   SETTINGS PANEL OPEN/CLOSE
═══════════════════════════════════════════ */
function openSettings() {
  syncSettingsUI();
  $('#settingsBackdrop').classList.add('show');
  $('#settingsPanel').classList.add('show');
}
function closeSettings() {
  $('#settingsBackdrop').classList.remove('show');
  $('#settingsPanel').classList.remove('show');
}

$('#settingsBtn').addEventListener('click', openSettings);
$('#settingsBackdrop').addEventListener('click', closeSettings);

/* ── toggle listeners ── */
function onToggle(id, key, extra) {
  $('#'+id).addEventListener('change', e => {
    cfg[key] = e.target.checked;
    saveCfg(); applySettingsToUI();
    if (extra) extra();
    renderBoard(); renderNumpad(); updateMistakeDots();
  });
}
onToggle('togHighlight','highlight');
onToggle('togSameNum','sameNum');
onToggle('togHints','showHints');
onToggle('togCandidates','showCandidates');
onToggle('togExcluded','showExcluded');
onToggle('togCheckMistakes','checkMistakes');
onToggle('togMistakeDots','showMistakeDots');
onToggle('togKeyboard','useKeyboard');
onToggle('togNumpad','showNumpad');

/* input mode seg */
$('#segCell').addEventListener('click', () => {
  cfg.inputMode='cell'; selectedNum=null; saveCfg();
  syncSettingsUI(); applySettingsToUI(); renderBoard(); renderNumpad();
});
$('#segNumber').addEventListener('click', () => {
  cfg.inputMode='number'; selected=null; saveCfg();
  syncSettingsUI(); applySettingsToUI(); renderBoard(); renderNumpad();
});

/* strike opts */
$$('.strike-opt').forEach(opt => {
  opt.addEventListener('click', () => {
    cfg.strikeLimit = +opt.dataset.val;
    saveCfg(); syncSettingsUI();
  });
});

/* ═══════════════════════════════════════════
   MAIN BUTTONS
═══════════════════════════════════════════ */
$('#clearBtn').addEventListener('click', clearPuzzle);

function clearPuzzle() {
  if (gameOver) return;
  playerBoard = puzzle.map(r => r.map(v => v));
  pencilMarks = Array.from({length:9}, () => Array.from({length:9}, () => new Set()));
  mistakes = 0;
  selected = null;
  selectedNum = null;
  updateMistakeDots();
  renderBoard();
  renderNumpad();
}


$('#overlayBtn').addEventListener('click', startGame);
$('#eraseBtn').addEventListener('click', eraseCell);
$('#hintBtn').addEventListener('click', giveHint);

$('#normalBtn').addEventListener('click', () => {
  pencilMode=false;
  $('#normalBtn').classList.add('active');
  $('#pencilBtn').classList.remove('active');
});
$('#pencilBtn').addEventListener('click', () => {
  pencilMode=true;
  $('#pencilBtn').classList.add('active');
  $('#normalBtn').classList.remove('active');
});

/* ═══════════════════════════════════════════
   KEYBOARD
═══════════════════════════════════════════ */
document.addEventListener('keydown', e => {
  if (!cfg.useKeyboard || gameOver) return;
  if (e.key>='1' && e.key<='9') { handleNumTap(+e.key); return; }
  if (e.key==='Backspace'||e.key==='Delete') { eraseCell(); return; }
  if (e.key==='p'||e.key==='P') {
    pencilMode=!pencilMode;
    $('#pencilBtn').classList.toggle('active', pencilMode);
    $('#normalBtn').classList.toggle('active', !pencilMode);
    return;
  }
  // arrow navigation (cell-first only)
  if (cfg.inputMode==='cell' && selected) {
    let [r,c]=selected;
    if (e.key==='ArrowUp'&&r>0) r--;
    else if (e.key==='ArrowDown'&&r<8) r++;
    else if (e.key==='ArrowLeft'&&c>0) c--;
    else if (e.key==='ArrowRight'&&c<8) c++;
    else return;
    selected=[r,c]; applyHighlights(); e.preventDefault();
  }
});

/* kick off */
startGame();
