/* ═══════════════════════════════════════════
   Logic Grid — UI layer
   Rendering, interaction, settings and persistence. Puzzle
   generation/solving lives in js/logic-engine.js (LogicEngine),
   which must be loaded first. Two interchangeable board layouts
   share one layout-independent store of pairwise marks.
═══════════════════════════════════════════ */

/* ── SETTINGS STATE (persisted) ── */
const DEFAULTS = {
  difficulty:              'easy',
  boardLayout:             'entity',   // 'entity' | 'triangular'
  packId:                  null,       // null = random pools, or 'theme:pack-name'
  autoElim:                true,
  highlightContradictions: true,
  showClueFilter:          true,
  requireNoWrong:          false,
};
let cfg = Object.assign({}, DEFAULTS, loadJSON('logic-cfg', {}));
function saveCfg() { saveJSON('logic-cfg', cfg); }

const ANCHOR = LogicEngine.ANCHOR;

/* ── GAME STATE ── */
let PUZZLE = null;       // { entities, attrCats, allCats, sol, solIndex, clues }
let marks = {};          // pairKey -> 1(yes) | 2(no) | 3(auto)  (blank = absent)
let badSet = new Set();  // pairKeys currently flagged as contradictions
let hintsUsed = 0;
let seconds = 0, timerInterval = null;
let solved = false;
let activeFilter = null, highlightedClue = null, filterVisible = false;

/* ═══════════════════════════════════════════
   PAIRWISE MARK STORE (layout-independent)
   pairKey joins with control characters — U+0000 between category and
   value, U+0001 between the two halves (invisible in most editors!) —
   so keys are collision-free and parseable by parsePairKey below.
═══════════════════════════════════════════ */
const KEY_US = '\u0000', KEY_RS = '\u0001';   // written as escapes: invisible control chars in source are a trap
function pairKey(cA, vA, cB, vB) {
  const a = cA + KEY_US + vA, b = cB + KEY_US + vB;
  return a < b ? a + KEY_RS + b : b + KEY_RS + a;
}
function parsePairKey(k) {
  const [a, b] = k.split(KEY_RS);
  const [cA, vA] = a.split(KEY_US);
  const [cB, vB] = b.split(KEY_US);
  return { cA, vA, cB, vB };
}
function getMark(cA, vA, cB, vB) { return marks[pairKey(cA, vA, cB, vB)] || 0; }
function setMark(cA, vA, cB, vB, s) {
  const k = pairKey(cA, vA, cB, vB);
  if (s === 0) delete marks[k]; else marks[k] = s;
}
function catValues(name) {
  if (name === ANCHOR) return PUZZLE.entities;
  return PUZZLE.attrCats.find(c => c.name === name).values;
}

function low(s) { return s.toLowerCase(); }

/* ═══════════════════════════════════════════
   GENERATION (engine call + story dressing)
═══════════════════════════════════════════ */
/* Pick a premise framing and one distinct aside per entity, so the story
   reads differently each game. Baked into the puzzle and persisted, so it
   stays stable across re-renders and reloads. */
function buildStory(pack, entities) {
  const theme = LOGIC_THEMES[pack.theme] || {};
  const premises = (pack.premises && pack.premises.length) ? pack.premises : [pack.premise];
  const raw = premises[Math.floor(Math.random() * premises.length)];
  // fill {cast}/{count} with the entities actually playing this puzzle
  const premise = LogicEngine.fillStoryTokens(raw, entities);
  const bank = shuffle((theme.asides || []).slice());
  const asides = {};
  entities.forEach((name, i) => { if (bank.length) asides[name] = bank[i % bank.length]; });
  return { premise, asides };
}

function generatePuzzle(diffKey) {
  const pack = (cfg.packId && LOGIC_PACKS[cfg.packId]) ? LOGIC_PACKS[cfg.packId] : null;
  const p = LogicEngine.generatePuzzle(diffKey, pack);
  if (p && pack) {
    p.packId = cfg.packId;
    p.story = buildStory(pack, p.entities);
  }
  return p;
}

/* ═══════════════════════════════════════════
   INTERACTION — cell cycling + auto-elimination
   Auto marks (state 3) are DERIVED: after any change they are wiped and
   recomputed from the current ✓ set. Removing or moving a ✓ therefore
   retracts the eliminations it caused (previously they lingered forever).
═══════════════════════════════════════════ */
function autoEliminate(cA, vA, cB, vB) {
  catValues(cA).forEach(a => { if (a !== vA && getMark(cA, a, cB, vB) === 0) setMark(cA, a, cB, vB, 3); });
  catValues(cB).forEach(b => { if (b !== vB && getMark(cA, vA, cB, b) === 0) setMark(cA, vA, cB, b, 3); });
}

function recomputeAutoMarks() {
  for (const k of Object.keys(marks)) if (marks[k] === 3) delete marks[k];
  if (!cfg.autoElim) return;
  const yes = Object.keys(marks).filter(k => marks[k] === 1);
  for (const k of yes) {
    const { cA, vA, cB, vB } = parsePairKey(k);
    autoEliminate(cA, vA, cB, vB);
  }
}

function cycleCell(cA, vA, cB, vB) {
  if (solved) return;
  const cur = getMark(cA, vA, cB, vB);
  // blank → ✓ → ✗ → blank; tapping an auto · solidifies it into a user ✗
  const next = cur === 0 ? 1 : cur === 1 ? 2 : cur === 3 ? 2 : 0;
  setMark(cA, vA, cB, vB, next);
  recomputeAutoMarks();
  if (cfg.highlightContradictions) scanContradictions(false);
  renderGrid();
  saveGameState();
  checkWin();
}

/* ═══════════════════════════════════════════
   CONTRADICTIONS / CHECK / HINT
═══════════════════════════════════════════ */
function scanContradictions(report) {
  badSet = new Set();
  const issues = [];
  const cats = PUZZLE.allCats;
  for (let i = 0; i < cats.length; i++) for (let j = i + 1; j < cats.length; j++) {
    const A = cats[i], B = cats[j];
    // each A-value may point to at most one B-value
    A.values.forEach(a => {
      const yes = B.values.filter(b => getMark(A.name, a, B.name, b) === 1);
      if (yes.length > 1) {
        yes.forEach(b => badSet.add(pairKey(A.name, a, B.name, b)));
        issues.push(`${a} is matched to two ${low(B.name)} values`);
      }
    });
    B.values.forEach(b => {
      const yes = A.values.filter(a => getMark(A.name, a, B.name, b) === 1);
      if (yes.length > 1) {
        yes.forEach(a => badSet.add(pairKey(A.name, a, B.name, b)));
        issues.push(`${b} is matched to two ${low(A.name)} values`);
      }
    });
  }
  if (report) {
    renderGrid();
    if (issues.length) showStatus('⚠️ ' + [...new Set(issues)].slice(0, 4).join(' · '), 'err');
    else showStatus('No contradictions — your logic holds.', 'ok');
  }
  return issues.length;
}

function checkProgress() {
  let correct = 0, wrong = 0;
  const needed = PUZZLE.entities.length * PUZZLE.attrCats.length;
  PUZZLE.entities.forEach((name, i) => {
    PUZZLE.attrCats.forEach(cat => {
      const cv = PUZZLE.sol[cat.name][i];
      if (getMark(ANCHOR, name, cat.name, cv) === 1) correct++;
      cat.values.forEach(v => {
        if (v !== cv && getMark(ANCHOR, name, cat.name, v) === 1) wrong++;
      });
    });
  });
  showStatus(`${correct} of ${needed} correct${wrong > 0 ? ` · ${wrong} wrong ✓ to fix` : ''}.`,
    wrong > 0 ? 'err' : 'info');
}

function giveHint() {
  if (solved) return;
  const open = [];
  PUZZLE.entities.forEach((name, i) => {
    PUZZLE.attrCats.forEach(cat => {
      const cv = PUZZLE.sol[cat.name][i];
      if (getMark(ANCHOR, name, cat.name, cv) !== 1) open.push({ name, cat: cat.name, val: cv });
    });
  });
  if (!open.length) { showStatus('Already fully solved!', 'ok'); return; }
  const h = open[Math.floor(Math.random() * open.length)];
  setMark(ANCHOR, h.name, h.cat, h.val, 1);
  recomputeAutoMarks();
  hintsUsed++;
  $('#hintCount').textContent = hintsUsed;
  if (cfg.highlightContradictions) scanContradictions(false);
  renderGrid();
  showStatus(`Hint: ${h.name}'s ${low(h.cat)} is ${h.val}.`, 'info');
  saveGameState();
  checkWin();
}

function resetGrid() {
  const wasSolved = solved;
  marks = {}; badSet = new Set(); solved = false;
  $('#statusLine').className = 'status-line';
  if (wasSolved) {   // resetting a finished board restarts the clock
    clearInterval(timerInterval);
    timerInterval = setInterval(tickTimer, 1000);
  }
  renderGrid();
  saveGameState();
}

/* ═══════════════════════════════════════════
   WIN
═══════════════════════════════════════════ */
function checkWin() {
  for (let i = 0; i < PUZZLE.entities.length; i++) {
    const name = PUZZLE.entities[i];
    for (const cat of PUZZLE.attrCats) {
      if (getMark(ANCHOR, name, cat.name, PUZZLE.sol[cat.name][i]) !== 1) return;
    }
  }
  if (cfg.requireNoWrong) {
    for (let i = 0; i < PUZZLE.entities.length; i++) {
      const name = PUZZLE.entities[i];
      for (const cat of PUZZLE.attrCats) {
        const cv = PUZZLE.sol[cat.name][i];
        for (const v of cat.values) {
          if (v !== cv && getMark(ANCHOR, name, cat.name, v) === 1) return;
        }
      }
    }
  }
  endGame();
}

/* Fill and show the win overlay from current state. Shared by endGame
   and by restoring an already-solved game (which previously reopened
   the overlay with an empty message). */
function showWinOverlay(bestMsg) {
  const verdict = culpritVerdict();
  $('#overlayTitle').textContent = verdict ? '🔍 Case Closed!' : '🎉 Solved!';
  $('#overlayMsg').textContent =
    (verdict ? verdict + ' ' : '') +
    `${cap(cfg.difficulty)} solved in ${formatTime(seconds)} with ` +
    `${hintsUsed} hint${hintsUsed === 1 ? '' : 's'}.${bestMsg ? ' ' + bestMsg : ''}`;
  $('#overlay').classList.add('show');
}

function endGame() {
  if (solved) return;
  solved = true;
  clearInterval(timerInterval);
  const best = loadJSON('logic-best', {});
  const prev = best[cfg.difficulty];
  let bestMsg;
  if (prev == null || seconds < prev) { best[cfg.difficulty] = seconds; saveJSON('logic-best', best); bestMsg = 'New best time!'; }
  else { bestMsg = `Best: ${formatTime(prev)}`; }
  $('#bestTime').textContent = formatTime(best[cfg.difficulty]);
  showWinOverlay(bestMsg);
  saveGameState();
}

/* Resolve the pack's culprit tell against the solution and render the verdict. */
function culpritVerdict() {
  if (!PUZZLE || !PUZZLE.packId) return '';
  const pack = LOGIC_PACKS[PUZZLE.packId];
  if (!pack || !pack.culprit || !pack.verdict) return '';
  const { category, value } = pack.culprit;
  const col = PUZZLE.sol[category];
  if (!col) return '';                    // tell's category sliced out at this difficulty
  const idx = col.indexOf(value);
  if (idx < 0) return '';
  return pack.verdict.replace('{name}', PUZZLE.entities[idx]);
}
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

/* ═══════════════════════════════════════════
   RENDERING
═══════════════════════════════════════════ */
function cellClass(state, key) {
  let cls = 'cell';
  if (state === 1) cls += ' cell-yes';
  else if (state === 2) cls += ' cell-no';
  else if (state === 3) cls += ' cell-auto';
  if (badSet.has(key)) cls += ' bad';
  return cls;
}
function cellGlyph(state) {
  return state === 1 ? '✓' : state === 2 ? '✗' : state === 3 ? '·' : '';
}
function cellTd(cA, vA, cB, vB) {
  const s = getMark(cA, vA, cB, vB);
  const key = pairKey(cA, vA, cB, vB);
  return `<td class="${cellClass(s, key)}" data-ca="${esc(cA)}" data-va="${esc(vA)}" ` +
         `data-cb="${esc(cB)}" data-vb="${esc(vB)}">${cellGlyph(s)}</td>`;
}
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderEntityGrid() {
  const cats = PUZZLE.attrCats;
  let h = '<table class="logic-grid"><thead><tr><th class="corner"></th>';
  cats.forEach(cat => { h += `<th class="cat-header" colspan="${cat.values.length}">${esc(cat.name)}</th>`; });
  h += '</tr><tr><th class="corner"></th>';
  cats.forEach(cat => cat.values.forEach(v => { h += `<th class="val-header"><span>${esc(v)}</span></th>`; }));
  h += '</tr></thead><tbody>';
  PUZZLE.entities.forEach(name => {
    h += `<tr><th class="row-header">${esc(name)}</th>`;
    cats.forEach(cat => cat.values.forEach(v => { h += cellTd(ANCHOR, name, cat.name, v); }));
    h += '</tr>';
  });
  h += '</tbody></table>';
  return h;
}

function renderTriangularGrid() {
  const all = PUZZLE.allCats;            // [anchor, ...attrCats]
  const C = all.length - 1;
  const colCats = all.slice(0, C);       // indices 0..C-1
  const rowCats = all.slice(1);          // indices 1..C  (allCats index = ri+1)

  let h = '<table class="logic-grid"><thead><tr><th class="spacer"></th><th class="spacer"></th>';
  colCats.forEach(cat => { h += `<th class="cat-header" colspan="${cat.values.length}">${esc(cat.name)}</th>`; });
  h += '</tr><tr><th class="spacer"></th><th class="spacer"></th>';
  colCats.forEach(cat => cat.values.forEach(v => { h += `<th class="val-header"><span>${esc(v)}</span></th>`; }));
  h += '</tr></thead><tbody>';

  rowCats.forEach((rowCat, ridx) => {
    const r = ridx + 1; // allCats index of this row category
    rowCat.values.forEach((rv, k) => {
      h += '<tr>';
      if (k === 0) h += `<th class="cat-header rowcat-label" rowspan="${rowCat.values.length}">${esc(rowCat.name)}</th>`;
      h += `<th class="row-header">${esc(rv)}</th>`;
      colCats.forEach((colCat, c) => {
        if (c < r) colCat.values.forEach(cv => { h += cellTd(rowCat.name, rv, colCat.name, cv); });
        else h += `<td class="spacer" colspan="${colCat.values.length}"></td>`;
      });
      h += '</tr>';
    });
  });
  h += '</tbody></table>';
  return h;
}

function renderGrid() {
  $('#board').innerHTML = cfg.boardLayout === 'triangular' ? renderTriangularGrid() : renderEntityGrid();
  updateCellSize();
}

/* Category/value pairs a clue talks about (for entity filtering). */
function clueValueRefs(c) {
  if (c.type === 'relational')  return [[c.cat1, c.val1], [c.cat2, c.val2]];
  if (c.type === 'comparative') return [[c.refCat, c.refValA], [c.refCat, c.refValB]];
  return [];
}

function renderClues() {
  const list = $('#cluesList');
  let clues = PUZZLE.clues.map((c, i) => ({ c, i }));
  if (activeFilter) {
    // "about this entity" = names them directly, OR references a value the
    // player has already ✓-linked to them (so linking clues surface too —
    // hard/expert clue sets may contain no name clues at all).
    const known = new Set();
    PUZZLE.attrCats.forEach(cat => cat.values.forEach(v => {
      if (getMark(ANCHOR, activeFilter, cat.name, v) === 1) known.add(cat.name + KEY_US + v);
    }));
    clues = clues.filter(({ c }) => {
      if (c.type === 'positive' || c.type === 'negative') {
        return PUZZLE.entities[c.e] === activeFilter;
      }
      return clueValueRefs(c).some(([cat, v]) => known.has(cat + KEY_US + v));
    });
  }
  if (!clues.length) {
    list.innerHTML = `<div class="clue-empty">No clues mention ${esc(activeFilter)} yet — ` +
      `mark one of their attributes ✓ and the linking clues will show up here.</div>`;
    return;
  }
  list.innerHTML = clues.map(({ c, i }) =>
    `<div class="clue-item${highlightedClue === i ? ' highlighted' : ''}${usedClues.has(i) ? ' used' : ''}" data-clue="${i}">` +
    `<span class="clue-num">${i + 1}.</span>${esc(c.text)}</div>`).join('');
}

function renderFilter() {
  const f = $('#clueFilter');
  let h = `<button class="filter-pill${activeFilter === null ? ' active' : ''}" data-ent="">All</button>`;
  PUZZLE.entities.forEach(e => {
    h += `<button class="filter-pill${activeFilter === e ? ' active' : ''}" data-ent="${esc(e)}">${esc(e)}</button>`;
  });
  f.innerHTML = h;
}

let usedClues = new Set();

function renderAll() {
  $('#filterBtn').style.display = cfg.showClueFilter ? '' : 'none';
  if (!cfg.showClueFilter) { filterVisible = false; $('#clueFilter').style.display = 'none'; }
  renderFilter();
  renderClues();
  renderGrid();
  renderStory();
}

function renderStory() {
  const panel = $('#storyPanel');
  if (!PUZZLE || !PUZZLE.packId || !LOGIC_PACKS[PUZZLE.packId]) {
    panel.style.display = 'none';
    return;
  }
  panel.style.display = '';
  const pack = LOGIC_PACKS[PUZZLE.packId];
  const story = PUZZLE.story || { premise: (pack.premises && pack.premises[0]) || pack.premise || '', asides: {} };
  $('#storyPremise').textContent = LogicEngine.fillStoryTokens(story.premise, PUZZLE.entities);
  $('#storyQuestion').textContent = LogicEngine.fillStoryTokens(pack.question || '', PUZZLE.entities);
  $('#storyQuestion').style.display = pack.question ? '' : 'none';
  $('#castList').innerHTML = PUZZLE.entities.map(name => {
    const base = pack.sketches[name] || '';
    const aside = (story.asides && story.asides[name]) ? ' ' + story.asides[name] : '';
    return `<div class="cast-item"><span class="cast-name">${esc(name)}.</span> ${esc(base)}${esc(aside)}</div>`;
  }).join('');
  $('#castList').style.display = 'none';
  $('#castBtn').textContent = 'Cast';
}

function showStatus(msg, type) {
  const b = $('#statusLine');
  b.textContent = msg;
  b.className = 'status-line show ' + type;
}

/* ── responsive cell sizing ──
   Driven by the CSS viewport width (reliable, unlike a freshly-rendered
   wrapper's clientWidth) and the column count of the *current* layout.
   Cells shrink to fit small tiers; wide tiers hit the floor and the
   board pans horizontally inside .board-wrap. */
function updateCellSize() {
  if (!PUZZLE) return;
  const N = PUZZLE.entities.length, C = PUZZLE.attrCats.length;
  const valueCols = C * N;                       // same column count in both layouts
  const isTri = cfg.boardLayout === 'triangular';
  const headerPx = isTri ? 104 : 84;             // left header columns + padding
  const bodyPad = window.innerWidth <= 560 ? 16 : 28;
  const vw = Math.min(document.documentElement.clientWidth || window.innerWidth || 360, 660);
  const avail = vw - bodyPad - headerPx;
  let cell = Math.floor(avail / valueCols);
  cell = Math.max(18, Math.min(40, cell));       // floor 18 keeps marks legible
  document.documentElement.style.setProperty('--cell', cell + 'px');
}

/* ═══════════════════════════════════════════
   GAME LIFECYCLE
═══════════════════════════════════════════ */
function startGame() {
  // generate FIRST: if it fails, the in-progress game stays fully intact
  const p = generatePuzzle(cfg.difficulty);
  if (!p) { showStatus('Could not generate a puzzle — please try again.', 'err'); return; }
  PUZZLE = p;

  solved = false;
  marks = {}; badSet = new Set(); usedClues = new Set();
  hintsUsed = 0; activeFilter = null; highlightedClue = null; filterVisible = false;
  seconds = 0;
  clearInterval(timerInterval);
  timerInterval = setInterval(tickTimer, 1000);

  $('#timer').textContent = '0:00';
  $('#hintCount').textContent = '0';
  const best = loadJSON('logic-best', {});
  $('#bestTime').textContent = best[cfg.difficulty] != null ? formatTime(best[cfg.difficulty]) : '—';
  $('#statusLine').className = 'status-line';
  $('#clueFilter').style.display = 'none';
  $('#filterBtn').textContent = 'Filter';
  $('#overlay').classList.remove('show');

  renderAll();
  saveGameState();
}

function tickTimer() {
  if (solved) return;
  seconds++;
  $('#timer').textContent = formatTime(seconds);
}

/* Pause the clock while the tab is hidden — a backgrounded phone browser
   throttles intervals unpredictably, so counting wall-clock ticks only
   while visible is both kinder and more accurate. */
document.addEventListener('visibilitychange', () => {
  clearInterval(timerInterval);
  if (!document.hidden && PUZZLE && !solved) {
    timerInterval = setInterval(tickTimer, 1000);
  }
});

/* ═══════════════════════════════════════════
   EVENT WIRING
═══════════════════════════════════════════ */
$('#board').addEventListener('click', e => {
  const td = e.target.closest('td.cell');
  if (!td) return;
  cycleCell(td.dataset.ca, td.dataset.va, td.dataset.cb, td.dataset.vb);
});

$('#cluesList').addEventListener('click', e => {
  const item = e.target.closest('.clue-item');
  if (!item) return;
  const i = +item.dataset.clue;
  if (highlightedClue !== i && !usedClues.has(i)) { highlightedClue = i; }
  else if (highlightedClue === i) { highlightedClue = null; usedClues.add(i); }
  else { usedClues.delete(i); highlightedClue = i; }
  renderClues();
  saveGameState();
});

$('#clueFilter').addEventListener('click', e => {
  const pill = e.target.closest('.filter-pill');
  if (!pill) return;
  activeFilter = pill.dataset.ent || null;
  renderFilter();
  renderClues();
});

$('#filterBtn').addEventListener('click', () => {
  filterVisible = !filterVisible;
  $('#clueFilter').style.display = filterVisible ? 'flex' : 'none';
  $('#filterBtn').textContent = filterVisible ? 'Hide' : 'Filter';
});

$('#newGameBtn').addEventListener('click', startGame);
$('#overlayBtn').addEventListener('click', startGame);
// tap outside the win card to dismiss it and admire the solved board
$('#overlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) $('#overlay').classList.remove('show');
});
$('#checkBtn').addEventListener('click', checkProgress);
$('#contraBtn').addEventListener('click', () => scanContradictions(true));
$('#hintBtn').addEventListener('click', giveHint);
$('#resetBtn').addEventListener('click', resetGrid);

$('#castBtn').addEventListener('click', () => {
  const cl = $('#castList');
  const showing = cl.style.display !== 'none';
  cl.style.display = showing ? 'none' : '';
  $('#castBtn').textContent = showing ? 'Cast' : 'Hide cast';
});

$('#difficultySelect').addEventListener('change', () => {
  cfg.difficulty = $('#difficultySelect').value;
  saveCfg();
  startGame();
});

/* Settings panel open/close and its wiring are shared (see js/theme.js).
   syncSettingsUI() below is invoked automatically when the panel opens. */

function onToggle(id, key, extra) {
  $('#' + id).addEventListener('change', e => {
    cfg[key] = e.target.checked;
    saveCfg();
    if (extra) extra();
  });
}
onToggle('togAutoElim', 'autoElim', () => {
  // auto marks are derived from the ✓ set — apply/retract them immediately
  recomputeAutoMarks();
  renderGrid();
  saveGameState();
});
onToggle('togContra', 'highlightContradictions', () => {
  if (!cfg.highlightContradictions) badSet = new Set();
  else scanContradictions(false);
  renderGrid();
});
onToggle('togClueFilter', 'showClueFilter', () => renderAll());
onToggle('togNoWrong', 'requireNoWrong', () => { if (!solved) checkWin(); });

/* board-layout segmented control */
$$('#layoutSeg .seg-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    cfg.boardLayout = btn.dataset.layout;
    saveCfg();
    syncSettingsUI();
    renderGrid();  // re-render only — marks survive (shared cell model)
  });
});

function applySettingsToUI() {
  $('#difficultySelect').value = cfg.difficulty;
}

function syncSettingsUI() {
  $('#togAutoElim').checked = cfg.autoElim;
  $('#togContra').checked = cfg.highlightContradictions;
  $('#togClueFilter').checked = cfg.showClueFilter;
  $('#togNoWrong').checked = cfg.requireNoWrong;
  $$('#layoutSeg .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.layout === cfg.boardLayout));
  syncPackPicker();
}

function initPackPicker() {
  const list = $('#packPickerList');
  if (!list) return;
  let h = `<div class="pick-row${!cfg.packId ? ' selected' : ''}" data-pack="">` +
    `<span class="pick-icon">🎲</span>Random<span class="pick-check">✓</span></div>`;
  Object.values(LOGIC_PACKS).forEach(pack => {
    h += `<div class="pick-row${cfg.packId === pack.id ? ' selected' : ''}" data-pack="${pack.id}">` +
      `<span class="pick-icon">${pack.icon}</span>${pack.name}<span class="pick-check">✓</span></div>`;
  });
  list.innerHTML = h;
  $$('#packPickerList .pick-row').forEach(row => {
    row.addEventListener('click', () => {
      cfg.packId = row.dataset.pack || null;
      saveCfg();
      syncPackPicker();
      closeSettings();
      startGame();
    });
  });
}

function syncPackPicker() {
  $$('#packPickerList .pick-row').forEach(row => {
    row.classList.toggle('selected', (row.dataset.pack || null) === (cfg.packId || null));
  });
}

/* ═══════════════════════════════════════════
   PERSIST / RESTORE
═══════════════════════════════════════════ */
function saveGameState() {
  if (!PUZZLE) return;
  pushHistory('logic-history', {
    difficulty: cfg.difficulty,
    packId: PUZZLE.packId || null,
    story: PUZZLE.story || null,
    entities: PUZZLE.entities,
    attrCats: PUZZLE.attrCats,
    sol: PUZZLE.sol,
    clues: PUZZLE.clues,
    grade: PUZZLE.grade || null,
    marks,
    usedClues: [...usedClues],
    highlightedClue,
    hintsUsed,
    seconds,
    solved,
  }, 2);
}

function restoreLogic() {
  const history = loadJSON('logic-history', []);
  if (!history.length) return false;
  const s = history[history.length - 1];
  if (!s || !s.entities || !s.attrCats || !s.sol || !s.clues) return false;

  cfg.difficulty = s.difficulty || cfg.difficulty;
  const solIndex = {};
  solIndex[ANCHOR] = {};
  s.entities.forEach((e, i) => { solIndex[ANCHOR][e] = i; });
  s.attrCats.forEach(cat => {
    solIndex[cat.name] = {};
    s.sol[cat.name].forEach((v, i) => { solIndex[cat.name][v] = i; });
  });
  PUZZLE = {
    entities: s.entities,
    attrCats: s.attrCats,
    allCats: [{ name: ANCHOR, values: s.entities }, ...s.attrCats],
    sol: s.sol,
    solIndex,
    clues: s.clues,
    grade: s.grade || null,
    packId: s.packId || null,
    story: s.story || null,
  };
  marks = s.marks || {};
  hintsUsed = s.hintsUsed || 0;
  seconds = s.seconds || 0;
  solved = !!s.solved;
  activeFilter = null; filterVisible = false;
  usedClues = new Set(s.usedClues || []);
  highlightedClue = (typeof s.highlightedClue === 'number') ? s.highlightedClue : null;

  $('#difficultySelect').value = cfg.difficulty;
  $('#hintCount').textContent = hintsUsed;
  $('#timer').textContent = formatTime(seconds);
  const best = loadJSON('logic-best', {});
  $('#bestTime').textContent = best[cfg.difficulty] != null ? formatTime(best[cfg.difficulty]) : '—';
  if (cfg.highlightContradictions) scanContradictions(false);
  renderAll();
  if (!solved) timerInterval = setInterval(tickTimer, 1000);
  else showWinOverlay('');   // previously reopened with an empty message
  return true;
}

window.addEventListener('resize', updateCellSize);

/* ── kick off ── */
initPackPicker();
applySettingsToUI();
if (!restoreLogic()) startGame();
