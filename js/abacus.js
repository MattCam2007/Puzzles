/* ═══════════════════════════════════════════
   ENGINE — pure logic lives in js/abacus-engine.js (loaded before this
   file). This module is the DOM/UI layer only.
═══════════════════════════════════════════ */
const E = AbacusEngine;

/* ═══════════════════════════════════════════
   SETTINGS STATE  (persisted to localStorage)
═══════════════════════════════════════════ */
const DEFAULTS = {
  difficulty:   'easy',
  mode:         'practice',   // freestyle | practice | trial
  requireCheck: false,        // false = auto-advance the moment the abacus is right
  style:        'soroban',    // soroban | suanpan | roman | schoty
  frame:        'theme',      // theme | wood | dark | brass
  beadShape:    'auto',       // Phase 5 appearance axis
  beadMaterial: 'themed',     // Phase 5 appearance axis
  ops:          { add: true, sub: true, mul: false, div: false },
  chainLen:     2,            // operands per question: 2 = a+b, 4 = a+b+c+d
  trialSecs:    60,
  showReadout:  true,
  showLabels:   true,
  autoClear:    true,
  quarterWire:  false,         // decorative-only schoty quarter-kopek wire; opt-in
};

let cfg = Object.assign({}, DEFAULTS, E.migrateCfg(loadJSON('abacus-cfg', {})));
cfg.ops = Object.assign({}, DEFAULTS.ops, cfg.ops || {});
function saveCfg() { saveJSON('abacus-cfg', cfg); }

/* ═══════════════════════════════════════════
   GAME STATE
═══════════════════════════════════════════ */
let rodState = [];      // vertical: [{h, e}] active-bead counts; rows: [count]
let beadRefs = [];      // DOM refs, same shape as rodState
let rodEls = [];         // DOM refs to each rod/row container (for pointer geometry)
let unitPx = 30;         // px per abstract unit; kept in sync with --u by fitAbacus()
let question = null;    // { op, answer, text }
let solved = 0;
let seconds = 0;        // count-up timer (practice mode)
let trialLeft = 0;      // countdown remaining (trial)
let trialRunning = false;
let timerInterval = null;
let flowTimer = null;   // debounce for auto-check confirmation
let advanceTimer = null; // debounce for practice-mode correct-answer advance (D1 fix)
let gameOver = false;   // trial ended
let checking = false;   // practice: correct-flash in progress

function fmt(n) { return n.toLocaleString('en-US'); }

function freshState() { return E.freshState(cfg.style); }
function abacusValue() { return E.abacusValue(rodState, cfg.style); }
function maxBoardValue() { return E.maxBoardValue(cfg.style); }
function placeLabel(rodIdx, S) { return E.placeLabel(rodIdx, S); }

/* ═══════════════════════════════════════════
   BOARD BUILD + RENDER
   All geometry is expressed as calc(var(--u) * n) strings, where n is
   an abstract-unit multiplier from E.STYLES and --u (px per unit) is
   the single value fitAbacus() updates on resize. Because every size
   and position is a live calc() expression, resizing never requires
   rebuilding the DOM — only the --u custom property changes.
═══════════════════════════════════════════ */
function el(cls) { const d = document.createElement('div'); d.className = cls; return d; }
function u(units) { return `calc(var(--u) * ${units})`; }

/* D4 fix: beads were plain unfocusable <div>s — invisible to assistive
   tech and keyboard users. Every bead is now a real toggle button
   (tabindex, role, aria-pressed); Enter/Space fire the same
   prefix-toggle logic as a tap. Descriptive aria-label text is filled
   in live by renderBeads(), since it depends on current state. */
function makeBeadAccessible(b, onActivate) {
  b.tabIndex = 0;
  b.setAttribute('role', 'button');
  b.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    onActivate();
  });
}

/* Decorative-only schoty detail: real Russian schoty often carried a
   short partial wire with 4 beads for quarter-kopeks, alongside the
   full 10-bead decimal wires. Purely cosmetic — these beads are static
   (not wired to rodState/abacusValue, no pointer/keyboard handlers) and
   opt-in via cfg.quarterWire (default off) so it can never affect the
   board's fitted size in the default experience. Rendered at a reduced
   height so it's unlikely to visibly clip even when added on top of an
   already-tight fit. */
function buildQuarterWire(S, wUnits) {
  const row = el('srow quarter-wire');
  row.style.width = u(wUnits);
  row.style.height = u(S.rowH * 0.55);
  row.appendChild(el('wire'));

  const lab = el('row-label');
  lab.textContent = '¼';
  lab.style.left = u(-S.labelW);
  lab.style.width = u(S.labelW - 0.2);
  row.appendChild(lab);

  for (let i = 0; i < 4; i++) {
    const b = el('bead decorative');
    b.style.width = u(S.beadW * 0.6);
    b.style.height = u(S.beadH * 0.6);
    b.style.left = u(i * S.beadW * 0.7);
    row.appendChild(b);
  }
  return row;
}

function buildAbacus() {
  fitAbacus();
  const S = E.STYLES[cfg.style];
  const board = $('#board');
  board.dataset.abacus = cfg.style;
  board.dataset.frame = cfg.frame;
  board.dataset.beadShape = E.resolveBeadShape(cfg.style, cfg.beadShape);
  board.dataset.beadMaterial = cfg.beadMaterial;
  board.classList.toggle('no-labels', !cfg.showLabels);
  board.innerHTML = '';
  beadRefs = [];
  rodEls = [];
  keyCursor = null; // rebuilt DOM invalidates any previous rod-cursor index

  const ab = el('abacus ' + (S.kind === 'vertical' ? 'vertical' : 'rows'));
  ab.style.borderWidth = u(S.frame);
  ab.style.padding = `${u(S.padY)} ${u(S.padX)}`;

  if (S.kind === 'vertical') {
    const heavenUnits = (S.heaven + 1) * S.beadH;
    const earthUnits = (S.earth + 1) * S.beadH;
    const rodUnits = heavenUnits + S.beamH + earthUnits;
    for (let r = 0; r < S.rods; r++) {
      const rod = el('rod');
      rod.style.width = u(S.rodW);
      rod.style.height = u(rodUnits);
      rod.appendChild(el('wire'));

      const beam = el('beam-seg');
      beam.style.top = u(heavenUnits);
      beam.style.height = u(S.beamH);
      beam.textContent = placeLabel(r, S);
      rod.appendChild(beam);

      const refs = { h: [], e: [] };
      for (let i = 0; i < S.heaven; i++) {
        const b = el('bead');
        b.style.width = u(S.beadW);
        b.style.height = u(S.beadH);
        makeBeadAccessible(b, () => {
          const st = rodState[r];
          st.h = (i < st.h) ? i : i + 1;
          onBeadMoved();
        });
        refs.h.push(b);
        rod.appendChild(b);
      }
      for (let i = 0; i < S.earth; i++) {
        const b = el('bead');
        b.style.width = u(S.beadW);
        b.style.height = u(S.beadH);
        makeBeadAccessible(b, () => {
          const st = rodState[r];
          st.e = (i < st.e) ? i : i + 1;
          onBeadMoved();
        });
        refs.e.push(b);
        rod.appendChild(b);
      }
      beadRefs.push(refs);
      rodEls.push(rod);
      wireRodPointerEvents(rod, r);
      ab.appendChild(rod);
    }
  } else {
    const wUnits = (S.beads + 1) * S.beadW; // +1 slot reserved for the inactive-cluster gap
    ab.style.paddingLeft = u(S.padX + S.labelW);
    for (let r = 0; r < S.rods; r++) {
      const row = el('srow');
      row.style.width = u(wUnits);
      row.style.height = u(S.rowH);
      row.appendChild(el('wire'));

      const lab = el('row-label');
      lab.textContent = placeLabel(r, S);
      lab.style.left = u(-S.labelW);
      lab.style.width = u(S.labelW - 0.2);
      row.appendChild(lab);

      const refs = [];
      for (let i = 0; i < S.beads; i++) {
        // the two middle beads are traditionally coloured to spot 4|5 at a glance
        const b = el('bead' + ((i === 4 || i === 5) ? ' mid' : ''));
        b.style.width = u(S.beadW * 0.86);
        b.style.height = u(S.beadH);
        makeBeadAccessible(b, () => {
          rodState[r] = (i < rodState[r]) ? i : i + 1;
          onBeadMoved();
        });
        refs.push(b);
        row.appendChild(b);
      }
      beadRefs.push(refs);
      rodEls.push(row);
      wireRodPointerEvents(row, r);
      ab.appendChild(row);
    }
    if (cfg.style === 'schoty' && cfg.quarterWire) ab.appendChild(buildQuarterWire(S, wUnits));
  }
  board.appendChild(ab);
  renderBeads();
}

function setBeadA11y(b, active, label) {
  b.classList.toggle('set', active);
  b.setAttribute('aria-pressed', active ? 'true' : 'false');
  b.setAttribute('aria-label', label);
}

function renderBeads() {
  const S = E.STYLES[cfg.style];
  if (S.kind === 'vertical') {
    const heavenUnits = (S.heaven + 1) * S.beadH;
    const earthTopUnits = heavenUnits + S.beamH;
    for (let r = 0; r < S.rods; r++) {
      const st = rodState[r], refs = beadRefs[r];
      const place = placeLabel(r, S);
      const digit = st.h * 5 + st.e;
      refs.h.forEach((b, i) => {
        // heaven bead i (0 = nearest beam): active rests on the beam
        const topUnits = i < st.h ? heavenUnits - (i + 1) * S.beadH : heavenUnits - (i + 2) * S.beadH;
        b.style.top = u(topUnits);
        setBeadA11y(b, i < st.h,
          `${place} rod reads ${digit}. Heaven bead ${i + 1} of ${S.heaven}, ${i < st.h ? 'active' : 'inactive'}.`);
      });
      refs.e.forEach((b, i) => {
        const topUnits = i < st.e ? earthTopUnits + i * S.beadH : earthTopUnits + (i + 1) * S.beadH;
        b.style.top = u(topUnits);
        setBeadA11y(b, i < st.e,
          `${place} rod reads ${digit}. Earth bead ${i + 1} of ${S.earth}, ${i < st.e ? 'active' : 'inactive'}.`);
      });
    }
  } else {
    const wUnits = (S.beads + 1) * S.beadW; // +1 slot reserved for the inactive-cluster gap
    for (let r = 0; r < S.rods; r++) {
      const place = placeLabel(r, S);
      beadRefs[r].forEach((b, i) => {
        const leftUnits = i < rodState[r] ? i * S.beadW : wUnits - (S.beads - i) * S.beadW;
        b.style.left = u(leftUnits);
        setBeadA11y(b, i < rodState[r],
          `${place} rod reads ${rodState[r]}. Bead ${i + 1} of ${S.beads}, ${i < rodState[r] ? 'active' : 'inactive'}.`);
      });
    }
  }
}

/* ═══════════════════════════════════════════
   RESPONSIVE FIT
   Measures #board's own box (sized purely by flex allocation — see
   css/abacus.css — never by its own content) and sets --u (px per
   abstract unit) so the abacus fills it without overflowing on either
   axis. A 2px safety margin absorbs sub-pixel rounding. Only the CSS
   variable changes on resize — every bead/rod/frame size is already a
   calc(var(--u) * n) expression, so no DOM rebuild is needed.
═══════════════════════════════════════════ */
const FIT_OPTS = { min: 9, max: 46 };

function fitAbacus() {
  const board = $('#board');
  if (!board) return;
  const box = board.getBoundingClientRect();
  if (box.width < 4 || box.height < 4) return;
  unitPx = E.computeUnit(Math.max(0, box.width - 2), Math.max(0, box.height - 2), cfg.style, FIT_OPTS);
  board.style.setProperty('--u', unitPx + 'px');
  updateRotateHint();
}

/* Portrait follow-up: rather than blocking portrait outright, show a
   small dismissible hint suggesting landscape when the board has been
   squeezed all the way down to the minimum legible unit — meaning
   there's real room to gain by rotating. Only makes sense to suggest
   when the viewport actually IS narrower than it is tall. Dismissal
   is remembered (once you know, you know). */
function updateRotateHint() {
  const hint = $('#rotateHint');
  if (!hint) return;
  const clamped = unitPx <= FIT_OPTS.min + 0.5;
  const isPortrait = window.innerHeight > window.innerWidth;
  const dismissed = localStorage.getItem('abacus-rotate-hint-dismissed') === '1';
  hint.classList.toggle('show', clamped && isPortrait && !dismissed);
}

/* ═══════════════════════════════════════════
   KINETIC BEADS
   Beads keep the original tap-to-toggle interaction and add real
   finger/mouse dragging on top: a pointerdown on a rod/row starts
   tracking a single bead group (heaven, earth, or the whole schoty
   row); pointermove feeds the live pointer position through the pure
   physics in js/abacus-engine.js (shovePositions) so already-active
   beads get carried along ("shoved") while beads on the far side stay
   put; pointerup either commits a tap (moved <= TAP_THRESHOLD_PX) with
   the original prefix-toggle rule, or quantizes/flings the drag to a
   new count and lets renderBeads() animate the settle.

   Coordinate model: each group is a 1D track, position 0 = touching
   the active wall, increasing away from it (same convention as the
   engine). `originPx`/`dir` map that abstract position to the actual
   screen axis (top for vertical rods — inverted for the heaven zone,
   direct for earth — left for schoty rows), matching the geometry
   renderBeads() already uses so there's no seam between live-drag
   painting and the calc(var(--u)*n) rest state.
═══════════════════════════════════════════ */
const TAP_THRESHOLD_PX = 4;
// px/ms of track-position travel to count as a decisive flick, not just a
// brisk drag. Real pointermove events land every ~8-16ms; a deliberate
// drag covering, say, 60px in 150ms is already ~0.4 px/ms, so the
// threshold has to sit well above ordinary dragging speed — only a real
// flick (large jump in a couple of frames) should override quantization.
const FLING_VELOCITY = 1.4;

let drag = null;

function axisClientPos(e, axis) { return axis === 'top' ? e.clientY : e.clientX; }
function coordToPosition(coord, originPx, dir) { return dir * (coord - originPx); }
function positionToCoord(position, originPx, dir) { return originPx + dir * position; }

/* Geometry + current state for one group, in absolute (viewport) px.
   Captured once at pointerdown and reused for the whole gesture — rods
   don't move mid-drag, so there's no need to re-measure every frame. */
function groupGeometry(rodIdx, group, rodBox) {
  const S = E.STYLES[cfg.style];
  if (S.kind === 'vertical') {
    const heavenUnits = (S.heaven + 1) * S.beadH;
    if (group === 'h') {
      // heaven track is inverted: position 0 (the wall/beam) is at the
      // BOTTOM of the heaven zone, increasing position moves UP (top decreases)
      return {
        axis: 'top', dir: -1,
        originPx: rodBox.top + (heavenUnits - S.beadH) * unitPx,
        beadSize: S.beadH * unitPx, groupSize: S.heaven, count: rodState[rodIdx].h,
        els: beadRefs[rodIdx].h,
      };
    }
    const earthTopUnits = heavenUnits + S.beamH;
    return {
      axis: 'top', dir: 1,
      originPx: rodBox.top + earthTopUnits * unitPx,
      beadSize: S.beadH * unitPx, groupSize: S.earth, count: rodState[rodIdx].e,
      els: beadRefs[rodIdx].e,
    };
  }
  return {
    axis: 'left', dir: 1,
    originPx: rodBox.left,
    beadSize: S.beadW * unitPx, groupSize: S.beads, count: rodState[rodIdx],
    els: beadRefs[rodIdx],
  };
}

/* Which group (heaven/earth, or null for a schoty row) and which bead
   index within it a pointerdown landed nearest to, using the same
   rest-position geometry as rendering. */
function hitTest(e, rodIdx, rodBox) {
  const S = E.STYLES[cfg.style];
  if (S.kind === 'vertical') {
    const heavenUnits = (S.heaven + 1) * S.beadH;
    const beamTop = rodBox.top + heavenUnits * unitPx;
    const beamBottom = beamTop + S.beamH * unitPx;
    const group = e.clientY < (beamTop + beamBottom) / 2 ? 'h' : 'e';
    const geo = groupGeometry(rodIdx, group, rodBox);
    const t = coordToPosition(axisClientPos(e, geo.axis), geo.originPx, geo.dir);
    return { group, index: clamp(Math.round(t / geo.beadSize), 0, geo.groupSize - 1), geo };
  }
  const geo = groupGeometry(rodIdx, null, rodBox);
  const t = coordToPosition(axisClientPos(e, geo.axis), geo.originPx, geo.dir);
  return { group: null, index: clamp(Math.round(t / geo.beadSize), 0, geo.groupSize - 1), geo };
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function applyGroupCount(rodIdx, group, newCount) {
  if (group === null) {
    rodState[rodIdx] = newCount;
  } else {
    rodState[rodIdx][group] = newCount;
  }
}

function paintFreePositions(d, freePositions) {
  const overshoot = d.beadSize * 0.5; // small defensive allowance so a fast drag doesn't visibly clip at the very edge
  const trackMax = d.groupSize * d.beadSize;
  const tentativeCount = E.beadsFromTrack(
    coordToPosition(d.lastClientPos, d.originPx, d.dir), d.groupSize, d.beadSize);
  freePositions.forEach((pos, i) => {
    const clamped = clamp(pos, -overshoot, trackMax + overshoot);
    const coord = positionToCoord(clamped, d.originPx, d.dir) - d.rodOriginAbs;
    d.els[i].style[d.axis] = coord + 'px';
    d.els[i].classList.toggle('set', i < tentativeCount);
  });
}

function wireRodPointerEvents(rodEl, rodIdx) {
  rodEl.addEventListener('pointerdown', e => {
    if (drag) return; // one active drag at a time
    if (e.button !== undefined && e.button > 0) return;
    const rodBox = rodEl.getBoundingClientRect();
    const hit = hitTest(e, rodIdx, rodBox);
    const geo = hit.geo;
    try { rodEl.setPointerCapture(e.pointerId); } catch (err) {}
    drag = {
      pointerId: e.pointerId, rodIdx, group: hit.group, dragIndex: hit.index,
      axis: geo.axis, originPx: geo.originPx, dir: geo.dir,
      beadSize: geo.beadSize, groupSize: geo.groupSize, count: geo.count, els: geo.els,
      rodEl, rodOriginAbs: geo.axis === 'top' ? rodBox.top : rodBox.left,
      startClientPos: axisClientPos(e, geo.axis), lastClientPos: axisClientPos(e, geo.axis),
      lastT: performance.now(), velocity: 0, moved: 0,
    };
    geo.els.forEach(el => el.classList.add('dragging'));
    e.preventDefault();
  });

  rodEl.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const p = axisClientPos(e, drag.axis);
    const now = performance.now();
    const dt = Math.max(1, now - drag.lastT);
    // velocity in track-position terms (matches flingTarget's sign
    // convention: negative = moving toward the wall)
    drag.velocity = (drag.dir * (p - drag.lastClientPos)) / dt;
    drag.moved = Math.max(drag.moved, Math.abs(p - drag.startClientPos));
    drag.lastClientPos = p;
    drag.lastT = now;

    const t = coordToPosition(p, drag.originPx, drag.dir);
    const free = E.shovePositions(drag.count, drag.groupSize, drag.dragIndex, t, drag.beadSize);
    paintFreePositions(drag, free);
    // live-update the logical value too (not just the visual position),
    // so the readout — and abacusValue() — track the gesture in real
    // time, not only once the drag is committed on release
    applyGroupCount(drag.rodIdx, drag.group, E.beadsFromTrack(t, drag.groupSize, drag.beadSize));
    updateReadout();
    e.preventDefault();
  });

  const endDrag = (e, cancelled) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const d = drag;
    drag = null;
    try { d.rodEl.releasePointerCapture(d.pointerId); } catch (err) {}
    d.els.forEach(el => el.classList.remove('dragging'));

    if (cancelled) {
      // pointermove live-mutates rodState for the readout (see above) —
      // revert that tentative value back to what it was before this drag
      applyGroupCount(d.rodIdx, d.group, d.count);
    } else if (d.moved <= TAP_THRESHOLD_PX) {
      // tap: original prefix-toggle rule
      applyGroupCount(d.rodIdx, d.group, d.dragIndex < d.count ? d.dragIndex : d.dragIndex + 1);
    } else {
      const t = coordToPosition(d.lastClientPos, d.originPx, d.dir);
      const quantized = E.beadsFromTrack(t, d.groupSize, d.beadSize);
      const flung = E.flingTarget(d.velocity, quantized, d.groupSize, FLING_VELOCITY);
      applyGroupCount(d.rodIdx, d.group, flung);
    }
    onBeadMoved(); // renders the settled rest state (CSS transition animates the snap) + saves/checks
  };
  rodEl.addEventListener('pointerup', e => endDrag(e, false));
  rodEl.addEventListener('pointercancel', e => endDrag(e, true));
}

let fitRaf = null;
function scheduleFit() {
  if (fitRaf) cancelAnimationFrame(fitRaf);
  fitRaf = requestAnimationFrame(() => { fitRaf = null; fitAbacus(); });
}
window.addEventListener('resize', scheduleFit);
window.addEventListener('orientationchange', scheduleFit);
if (typeof ResizeObserver !== 'undefined') {
  const boardWrapEl = document.querySelector('.board-wrap');
  if (boardWrapEl) new ResizeObserver(scheduleFit).observe(boardWrapEl);
}

function clearAbacus() {
  rodState = freshState();
  renderBeads();
  updateReadout();
  saveGameState();
}

function onBeadMoved() {
  renderBeads();
  updateReadout();
  if (cfg.mode === 'trial' && !trialRunning && !gameOver && question) startTrialCountdown();
  flowCheck();
  saveGameState();
}

function updateReadout() {
  $('#readout').textContent = fmt(abacusValue());
}

/* ═══════════════════════════════════════════
   QUESTION GENERATION — delegates to the pure engine (js/abacus-engine.js)
═══════════════════════════════════════════ */
function genQuestion() {
  question = E.genQuestion(cfg, Math.random);
}

/* ═══════════════════════════════════════════
   MODES / SESSION FLOW
═══════════════════════════════════════════ */
function defaultFeedback() {
  if (cfg.mode === 'practice') {
    return cfg.requireCheck
      ? 'Set the answer on the abacus, then hit Check.'
      : 'It advances by itself the moment the abacus is right.';
  }
  if (cfg.mode === 'trial') {
    if (gameOver) return '';
    return trialRunning ? 'Go!' : 'Timer starts on your first bead move.';
  }
  return '';
}

function updateQuestionUI() {
  $('#questionText').textContent = question ? question.text : '';
  $('#feedback').textContent = defaultFeedback();
}

function updateModeUI() {
  const m = cfg.mode;
  const showQuestion = m !== 'freestyle';
  $('#questionBar').classList.toggle('hidden', !showQuestion);
  $('#actionRow').classList.toggle('hidden', !showQuestion);
  // Check/Reveal visibility follows requireCheck, not the mode — Skip
  // stays available in #actionRow regardless.
  $('#checkBtn').classList.toggle('hidden', !cfg.requireCheck);
  $('#revealBtn').classList.toggle('hidden', !cfg.requireCheck);
  $('#solvedBox').classList.toggle('hidden', !showQuestion);
  $('#timerBox').classList.toggle('hidden', !showQuestion);
  $('#bestBox').classList.toggle('hidden', m !== 'trial');
  $('#readout').classList.toggle('hidden', !(cfg.showReadout || m === 'freestyle'));
}

function updateStats() { $('#solved').textContent = solved; }

function updateTimerDisplay() {
  $('#timer').textContent = formatTime(cfg.mode === 'trial' ? Math.max(0, trialLeft) : seconds);
}

function bestKey() { return E.bestKey(cfg); }

function updateBestBox() {
  const b = loadJSON('abacus-best', {})[bestKey()];
  $('#best').textContent = (b === undefined) ? '–' : b;
}

function stopTimer() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
}

/* D1 fix: checkAnswer()'s correct-answer advance is debounced by 800ms.
   Without this, leaving that window open (e.g. hitting New Game right
   after answering correctly) lets the orphaned timeout fire nextQuestion()
   later and silently swap out the question the user is now looking at. */
function clearAdvance() {
  if (advanceTimer) { clearTimeout(advanceTimer); advanceTimer = null; }
}

/* D12 fix: both timers derive elapsed time from a wall-clock timestamp
   instead of counting setInterval ticks. A tick counter loses time
   whenever the browser throttles a backgrounded/inactive tab (Chrome
   commonly drops backgrounded timers to ~1 tick/minute) — the display
   would silently fall behind real elapsed time and a trial could run
   well past its nominal length. Deriving from Date.now() means the
   moment the tab is foregrounded again and a tick finally fires, the
   catch-up is exact — tickTimer()/tickTrial() are pulled out as their
   own functions (rather than inline in startTimer()/startTrialCountdown())
   so a test can invoke a single tick deterministically after faking a
   large time jump. */
let timerStartedAt = null;
let secondsAtStart = 0;

function tickTimer() {
  seconds = secondsAtStart + Math.floor((Date.now() - timerStartedAt) / 1000);
  updateTimerDisplay();
  if (seconds % 5 === 0) saveGameState();
}

function startTimer() {
  stopTimer();
  timerStartedAt = Date.now();
  secondsAtStart = seconds;
  timerInterval = setInterval(tickTimer, 1000);
}

let trialStartedAt = null;
let trialLeftAtStart = 0;

function tickTrial() {
  trialLeft = Math.max(0, trialLeftAtStart - Math.floor((Date.now() - trialStartedAt) / 1000));
  updateTimerDisplay();
  if (trialLeft <= 0) { endTrial(); return; }
  saveGameState();
}

function startTrialCountdown() {
  trialRunning = true;
  $('#feedback').textContent = 'Go!';
  stopTimer();
  trialStartedAt = Date.now();
  trialLeftAtStart = trialLeft;
  timerInterval = setInterval(tickTrial, 1000);
}

function endTrial() {
  stopTimer();
  if (flowTimer) { clearTimeout(flowTimer); flowTimer = null; }
  trialRunning = false;
  gameOver = true;
  const bests = loadJSON('abacus-best', {});
  const prev = bests[bestKey()] || 0;
  const isNew = solved > prev;
  if (isNew) { bests[bestKey()] = solved; saveJSON('abacus-best', bests); }
  updateBestBox();
  showTrialOverlay(isNew);
  saveGameState();
}

function showTrialOverlay(isNew) {
  $('#overlayTitle').textContent = '⏱ Time!';
  $('#overlayMsg').textContent =
    `You solved ${solved} question${solved === 1 ? '' : 's'} in ${formatTime(cfg.trialSecs)} on ${cfg.difficulty}.` +
    (isNew ? ' 🏆 New best!' : ` Best: ${loadJSON('abacus-best', {})[bestKey()] || 0}.`);
  $('#overlay').classList.add('show');
}

function hideOverlay() { $('#overlay').classList.remove('show'); }

function startGame() {
  gameOver = false;
  checking = false;
  solved = 0; seconds = 0;
  trialLeft = cfg.trialSecs;
  trialRunning = false;
  if (flowTimer) { clearTimeout(flowTimer); flowTimer = null; }
  clearAdvance();
  stopTimer();
  hideOverlay();
  rodState = freshState();
  buildAbacus();
  question = null;
  if (cfg.mode !== 'freestyle') genQuestion();
  updateModeUI();
  updateQuestionUI();
  updateReadout();
  updateStats();
  updateTimerDisplay();
  updateBestBox();
  if (cfg.mode === 'practice') startTimer();
  saveGameState();
}

function nextQuestion() {
  checking = false;
  clearAdvance();
  if (cfg.autoClear) {
    rodState = freshState();
    renderBeads();
    updateReadout();
  }
  genQuestion();
  updateQuestionUI();
  saveGameState();
  // D11: with autoClear off, the board can already show the new
  // question's answer by coincidence (left over from the previous
  // one). Check immediately so that carryover is recognised right
  // away, instead of silently sitting there until some unrelated bead
  // move happens to invoke flowCheck().
  if (!cfg.autoClear) flowCheck();
}

function checkAnswer() {
  if (!cfg.requireCheck || !question || gameOver || checking) return;
  const v = abacusValue();
  const bar = $('#questionBar');
  if (v === question.answer) {
    checking = true;
    solved++;
    updateStats();
    bar.classList.remove('wrong');
    bar.classList.add('correct');
    $('#feedback').textContent = '✓ Correct!';
    flashCorrect();
    clearAdvance();
    advanceTimer = setTimeout(() => { advanceTimer = null; bar.classList.remove('correct'); nextQuestion(); }, 800);
  } else {
    bar.classList.remove('wrong');
    void bar.offsetWidth; /* restart the shake animation */
    bar.classList.add('wrong');
    $('#feedback').textContent = `Not yet — the abacus reads ${fmt(v)}.`;
    setTimeout(() => bar.classList.remove('wrong'), 400);
  }
  saveGameState();
}

/* Deliberate "you got it" feedback shared by both the manual-Check
   path and the auto-advance path: the frame glows green briefly and a
   small checkmark flashes near the readout, then the next question
   already appears. */
function flashCorrect() {
  const abacusEl = $('.abacus');
  if (abacusEl) {
    abacusEl.classList.add('correct-glow');
    setTimeout(() => abacusEl.classList.remove('correct-glow'), 350);
  }
  const flash = $('#correctFlash');
  if (flash) {
    flash.classList.add('show');
    setTimeout(() => flash.classList.remove('show'), 600);
  }
}

function reveal() {
  if (!question || gameOver) return;
  $('#feedback').textContent = `Answer: ${fmt(question.answer)} — set it on the abacus, then Check or Skip.`;
}

/* auto-check (practice + trial, whenever requireCheck is off — the
   default): the value must hold for 450ms so passing through the
   answer mid-move doesn't trigger an advance */
function flowCheck() {
  if (cfg.requireCheck || cfg.mode === 'freestyle' || !question || gameOver) return;
  if (flowTimer) { clearTimeout(flowTimer); flowTimer = null; }
  if (abacusValue() === question.answer) {
    flowTimer = setTimeout(() => {
      flowTimer = null;
      if (gameOver) return;
      solved++;
      updateStats();
      const bar = $('#questionBar');
      bar.classList.add('correct');
      flashCorrect();
      setTimeout(() => bar.classList.remove('correct'), 450);
      nextQuestion();
    }, 450);
  }
}

/* ═══════════════════════════════════════════
   PERSIST + RESTORE
   D7 fix: saveGameState() runs on every bead move, so it writes a
   single-entry array directly instead of pushHistory()'s 20-entry ring
   buffer (only the latest snapshot is ever read back).
═══════════════════════════════════════════ */
function saveGameState() {
  saveJSON('abacus-history', [{
    style: cfg.style, mode: cfg.mode,
    rodState, question,
    solved, seconds, trialLeft,
    trialStarted: trialRunning, gameOver,
  }]);
}

function validState(s, S) {
  if (!Array.isArray(s) || s.length !== S.rods) return false;
  if (S.kind === 'vertical') {
    return s.every(x => x && typeof x.h === 'number' && typeof x.e === 'number' &&
      x.h >= 0 && x.h <= S.heaven && x.e >= 0 && x.e <= S.earth);
  }
  return s.every(x => typeof x === 'number' && x >= 0 && x <= S.beads);
}

function restoreGameState() {
  const h = loadJSON('abacus-history', []);
  if (!h.length) return false;
  const s = h[h.length - 1];
  const S = E.STYLES[cfg.style];
  if (!s || s.style !== cfg.style || s.mode !== cfg.mode) return false;
  if (!validState(s.rodState, S)) return false;

  rodState = s.rodState;
  question = (s.question && typeof s.question.answer === 'number') ? s.question : null;
  solved = s.solved | 0;
  seconds = s.seconds | 0;
  trialLeft = typeof s.trialLeft === 'number' ? s.trialLeft : cfg.trialSecs;
  gameOver = !!s.gameOver;
  trialRunning = false;

  buildAbacus();
  if (cfg.mode !== 'freestyle' && !question) genQuestion();
  updateModeUI();
  updateQuestionUI();
  updateReadout();
  updateStats();
  updateTimerDisplay();
  updateBestBox();

  if (!gameOver && cfg.mode === 'practice') startTimer();
  if (cfg.mode === 'trial') {
    if (gameOver) showTrialOverlay(false);
    else if (trialLeft <= 0) endTrial();
    else if (s.trialStarted) $('#feedback').textContent = 'Paused — timer resumes on your next bead move.';
  }
  return true;
}

/* ═══════════════════════════════════════════
   GUIDES — reading + technique per abacus style
═══════════════════════════════════════════ */
const GUIDES = {
  soroban: {
    title: 'Soroban — Japanese Abacus',
    sections: [
      ['Reading the board',
        `<p>Every rod is one decimal place — ones on the right, tens next, and so on. The single bead above the crossbar (the <em>heaven</em> bead) is worth 5; the four beads below (<em>earth</em> beads) are worth 1 each. A bead only counts when it is pushed <strong>toward</strong> the crossbar.</p>
         <p>So 7 = heaven bead down + two earth beads up, and an empty rod (everything pushed away) is 0.</p>
         <div class="tip">Read the whole board like a written number, left to right — don't total the rods one at a time.</div>`],
      ['Addition',
        `<p>Work left to right, largest place first, adding each digit on its own rod. When the beads you need aren't free, use a complement instead of counting: to add 4 when only the heaven bead is free, add 5 and take 1 away (+4 = +5 − 1). To add 8 to a rod already showing 6, take 2 away and carry 1 to the rod on the left (+8 = −2 + 10).</p>
         <div class="tip">Memorise the pairs that make 5 (1·4, 2·3) and 10 (1·9, 2·8, 3·7, 4·6, 5·5) — every fast addition move comes from them.</div>`],
      ['Subtraction',
        `<p>The mirror of addition. To take 4 away when no earth beads are up, subtract 5 and give 1 back (−4 = −5 + 1). When the rod is too small, borrow: to subtract 8 from a rod showing 3, remove 1 from the rod on the left and add 2 (−8 = −10 + 2).</p>
         <div class="tip">Never "count down" beads one by one — decide the complement move first, then make both bead motions in one flow.</div>`],
      ['Multiplication',
        `<p>Chains are done one factor at a time: multiply the running result by the next factor. For a two-digit factor, split it by place: ×23 is ×20 + ×3 — multiply by 2 one rod to the left, then by 3 in place, accumulating the partial products on the board.</p>
         <div class="tip">Keep your times tables verbal ("6·7 — 42") and let the abacus do only the accumulation. That's the whole trick.</div>`],
      ['Division',
        `<p>Set the dividend on the right of the board. Ask how many times the divisor fits into the leading digits, park that quotient digit on a spare rod to the left, subtract quotient × divisor from the dividend, then shift one place right and repeat — long division, with the abacus holding the remainder for you.</p>
         <div class="tip">If a subtraction won't go, your quotient digit was one too big — add the divisor back and lower it. That correction is normal technique, not a mistake.</div>`],
    ],
  },
  suanpan: {
    title: 'Suanpan — Chinese Abacus',
    sections: [
      ['Reading the board',
        `<p>Same toward-the-beam rule as the soroban, but each rod carries <em>two</em> heaven beads (5 each) and <em>five</em> earth beads (1 each), so a single rod can hold up to 15. For plain reading you only ever need one heaven and four earth beads — the spares are working room.</p>
         <div class="tip">A rod showing more than 9 isn't wrong — it's an un-normalised digit. Push the carry left whenever it's convenient.</div>`],
      ['Addition',
        `<p>Identical complement technique to the soroban: +4 = +5 − 1, and carries are +10 on the left rod. The extra beads are the suanpan's luxury: in a long chain you can let a rod climb to 12 or 14 and delay the carry until the end, instead of rippling carries mid-sum.</p>
         <div class="tip">Park overflow on the spare beads while your rhythm is hot; normalise all the carries once at the end.</div>`],
      ['Subtraction',
        `<p>Reverse the moves: −4 = −5 + 1, and a borrow takes 1 from the rod on the left while adding the ten-complement here. The fifth earth bead lets you borrow lazily — go below "normal" bead positions momentarily and settle up afterwards.</p>
         <div class="tip">In chained subtraction, borrow once and keep moving — don't stop the chain to tidy each rod.</div>`],
      ['Multiplication',
        `<p>Digit-by-digit like the soroban: multiply, add the shifted partial product, move on. Because rods hold up to 15, you can add a big partial like 9×8 = 72 in one motion and normalise later — the 2:5 layout absorbs the intermediate overflow.</p>
         <div class="tip">The 2:5 bead count originally served hexadecimal weight-and-measure sums — for decimal work, treat it exactly like a soroban with slack.</div>`],
      ['Division',
        `<p>Classic long division: estimate the quotient digit, subtract quotient × divisor, shift right. Traditional suanpan schools memorised special division rhymes, but estimate-and-correct works perfectly: let a rod exceed 9 mid-step and push the carries when the dust settles.</p>
         <div class="tip">Check each step: the running remainder must always be smaller than the divisor — if not, bump the quotient digit up.</div>`],
    ],
  },
  roman: {
    title: 'Roman Hand Abacus',
    sections: [
      ['Reading the board',
        `<p>A pocket-sized bronze plate. Each column is marked with its place — I, X, C, M, then X̄, C̄, M̄ for ten-thousands and up. Every column has four pebbles in the lower groove worth 1 each and one pebble in the upper groove worth 5 — the same 4 + 1 layout the soroban later refined. A pebble counts when slid toward the crossbar.</p>
         <div class="tip">VII on the I-column = upper pebble in + two lower pebbles up. Roman numerals map straight onto the grooves.</div>`],
      ['Addition',
        `<p>Merge column by column, and exchange whenever a column overflows: five I-pebbles trade for one upper pebble, and two upper pebbles (5 + 5) trade for a single pebble in the next column left. This is exactly why Roman numerals write 4 as IV — the exchange is built into the notation.</p>
         <div class="tip">Do the exchanges immediately; a Roman column has no spare beads to park overflow on.</div>`],
      ['Subtraction',
        `<p>Reverse the exchanges. To remove more than a column holds, break a pebble from the column on the left into ten here (two upper fives, or five ones plus one five), then take away what you need.</p>
         <div class="tip">Think "make change": borrowing is exchanging a big coin for ten small ones — Roman merchants used this board at the money table.</div>`],
      ['Multiplication',
        `<p>Romans multiplied by <em>duplation</em> — doubling. To multiply by 13, double a copy of the number to get ×2, ×4, ×8, then add the doublings that sum to 13 (8 + 4 + 1). On the board that's a run of shifted additions, one for each chosen doubling.</p>
         <div class="tip">Doubling on the abacus is a single sweep: double each column right-to-left and exchange the overflow as you go.</div>`],
      ['Division',
        `<p>Repeated subtraction. Subtract the divisor — and its doubles and tens, to move faster — from the dividend, counting how many times on a spare column, until what remains is smaller than the divisor. The count is the quotient; the leftover is the remainder.</p>
         <div class="tip">Subtract divisor × 10 while it still fits, then divisor × 1: two gears instead of grinding one at a time.</div>`],
    ],
  },
  schoty: {
    title: 'Schoty — Russian Abacus',
    sections: [
      ['Reading the board',
        `<p>Wires run sideways and each carries ten beads — one wire per decimal place, biggest at the top. Slide beads to the <strong>left</strong> to count them: a wire's digit is simply how many beads sit on the left. The two coloured middle beads let you see "past 4" at a glance without counting.</p>
         <div class="tip">All beads on the right = 0. There are no fives to decode — the schoty is pure tally, which is why it's the easiest abacus to learn.</div>`],
      ['Addition',
        `<p>Slide beads left, wire by wire. When a wire runs out — you need to add 7 but only 4 beads remain on the right — use the ten-complement: slide one bead left on the wire <em>above</em> (that's +10), then slide 3 beads back right here (10 − 7 = 3).</p>
         <div class="tip">Sweep multiple beads in one finger stroke — the schoty is built for fast bulk slides, not bead-at-a-time pushes.</div>`],
      ['Subtraction',
        `<p>The reverse: slide beads right. To take 7 when only 3 sit on the left, borrow — slide one bead right on the wire above (−10) and slide 3 beads left here (+3). The running result stays readable on the left the whole time.</p>
         <div class="tip">Russian clerks ran ledgers this way for two centuries: subtraction is just addition with the slides mirrored.</div>`],
      ['Multiplication',
        `<p>Shift-and-add. Moving the same digits one wire up multiplies by 10, so ×23 = add the number twice shifted one wire up, then three more times in place. Work through the multiplier digit by digit and let the wires do the place-keeping.</p>
         <div class="tip">×5 is quicker as ×10 halved: shift up a wire, then halve each wire's count top-to-bottom.</div>`],
      ['Division',
        `<p>Repeated subtraction with shifts: subtract divisor × 10 (one wire up) while it fits, tallying each subtraction on a spare wire, then drop to divisor × 1 and continue. The tally wire reads out the quotient; what's left on the main wires is the remainder.</p>
         <div class="tip">Estimate first — "how many tens of the divisor fit?" — so the tally wire fills in two bursts instead of dozens of single subtractions.</div>`],
    ],
  },
};

function openGuide() {
  const g = GUIDES[cfg.style];
  $('#guideTitle').textContent = g.title;
  $('#guideBody').innerHTML = g.sections.map(([h, body]) => `<h3>${h}</h3>${body}`).join('');
  $('#guideOverlay').classList.add('show');
}

/* ═══════════════════════════════════════════
   SETTINGS UI
═══════════════════════════════════════════ */
function syncSettingsUI() {
  $('#togReadout').checked = cfg.showReadout;
  $('#togLabels').checked = cfg.showLabels;
  $('#togAutoClear').checked = cfg.autoClear;
  $('#togRequireCheck').checked = cfg.requireCheck;
  $('#togQuarterWire').checked = cfg.quarterWire;
  $('#quarterWireRow').classList.toggle('hidden', cfg.style !== 'schoty');
  $$('#chainPicker .strike-opt').forEach(o => o.classList.toggle('active', +o.dataset.val === cfg.chainLen));
  $$('#trialPicker .strike-opt').forEach(o => o.classList.toggle('active', +o.dataset.val === cfg.trialSecs));
  $$('[data-abacus-pick]').forEach(r => r.classList.toggle('selected', r.dataset.abacusPick === cfg.style));
  $$('[data-frame-pick]').forEach(r => r.classList.toggle('selected', r.dataset.framePick === cfg.frame));
  $$('[data-bead-shape-pick]').forEach(r => r.classList.toggle('selected', r.dataset.beadShapePick === cfg.beadShape));
  $$('[data-bead-material-pick]').forEach(r => r.classList.toggle('selected', r.dataset.beadMaterialPick === cfg.beadMaterial));
}

function onToggle(id, key, extra) {
  $('#' + id).addEventListener('change', e => {
    cfg[key] = e.target.checked;
    saveCfg();
    if (extra) extra();
  });
}

/* Keeps the top-bar controls (mode/difficulty select, op chips) and their
   settings-sheet mirrors (#modePicker/#difficultyPicker/#opChipsSettings —
   shown on narrow screens where the top bar hides them, see
   css/abacus.css's max-width:560px query) in sync with cfg. */
function syncTopBar() {
  $('#modeSelect').value = cfg.mode;
  $('#difficultySelect').value = cfg.difficulty;
  $$('.op-chip').forEach(c => c.classList.toggle('active', !!cfg.ops[c.dataset.op]));
  $$('#modePicker .strike-opt').forEach(o => o.classList.toggle('active', o.dataset.val === cfg.mode));
  $$('#difficultyPicker .strike-opt').forEach(o => o.classList.toggle('active', o.dataset.val === cfg.difficulty));
}

function setMode(mode) {
  cfg.mode = mode;
  saveCfg();
  syncTopBar();
  startGame();
}

function setDifficulty(difficulty) {
  cfg.difficulty = difficulty;
  saveCfg();
  syncTopBar();
  startGame();
}

/* ═══════════════════════════════════════════
   WIRING
═══════════════════════════════════════════ */
$('#newGameBtn').addEventListener('click', startGame);
$('#overlayBtn').addEventListener('click', startGame);
$('#clearBtn').addEventListener('click', clearAbacus);
$('#checkBtn').addEventListener('click', checkAnswer);
$('#revealBtn').addEventListener('click', reveal);
$('#skipBtn').addEventListener('click', () => { if (question && !gameOver) nextQuestion(); });
$('#guideBtn').addEventListener('click', openGuide);
$('#guideCloseBtn').addEventListener('click', () => $('#guideOverlay').classList.remove('show'));
$('#guideOverlay').addEventListener('click', e => {
  if (e.target.id === 'guideOverlay') e.currentTarget.classList.remove('show');
});

$('#rotateHintClose').addEventListener('click', () => {
  localStorage.setItem('abacus-rotate-hint-dismissed', '1');
  $('#rotateHint').classList.remove('show');
});

$('#modeSelect').addEventListener('change', e => setMode(e.target.value));
$('#difficultySelect').addEventListener('change', e => setDifficulty(e.target.value));
$$('#modePicker .strike-opt').forEach(o => o.addEventListener('click', () => setMode(o.dataset.val)));
$$('#difficultyPicker .strike-opt').forEach(o => o.addEventListener('click', () => setDifficulty(o.dataset.val)));

$$('.op-chip').forEach(chip => chip.addEventListener('click', () => {
  const op = chip.dataset.op;
  const turningOn = !cfg.ops[op];
  // at least one operation must stay enabled
  if (!turningOn && Object.values(cfg.ops).filter(Boolean).length <= 1) return;
  cfg.ops[op] = turningOn;
  saveCfg();
  syncTopBar();
  if (cfg.mode !== 'freestyle' && (!question || !cfg.ops[question.op])) {
    genQuestion();
    updateQuestionUI();
    saveGameState();
  }
}));

$$('[data-abacus-pick]').forEach(r => r.addEventListener('click', () => {
  if (cfg.style === r.dataset.abacusPick) return;
  // D3: preserve the board's value across a style switch instead of
  // silently wiping it — clamp to the new style's capacity if it
  // doesn't fit (e.g. switching a 9-rod board down to 7-rod roman/schoty).
  const oldValue = abacusValue();
  cfg.style = r.dataset.abacusPick;
  saveCfg();
  rodState = E.setValue(Math.min(oldValue, E.maxBoardValue(cfg.style)), cfg.style);
  buildAbacus();
  updateReadout();
  syncSettingsUI();
  saveGameState();
}));

$$('[data-frame-pick]').forEach(r => r.addEventListener('click', () => {
  cfg.frame = r.dataset.framePick;
  saveCfg();
  $('#board').dataset.frame = cfg.frame;
  syncSettingsUI();
}));

$$('[data-bead-shape-pick]').forEach(r => r.addEventListener('click', () => {
  cfg.beadShape = r.dataset.beadShapePick;
  saveCfg();
  $('#board').dataset.beadShape = E.resolveBeadShape(cfg.style, cfg.beadShape);
  syncSettingsUI();
}));

$$('[data-bead-material-pick]').forEach(r => r.addEventListener('click', () => {
  cfg.beadMaterial = r.dataset.beadMaterialPick;
  saveCfg();
  $('#board').dataset.beadMaterial = cfg.beadMaterial;
  syncSettingsUI();
}));

$$('#chainPicker .strike-opt').forEach(o => o.addEventListener('click', () => {
  cfg.chainLen = +o.dataset.val;
  saveCfg();
  syncSettingsUI();
  if (cfg.mode !== 'freestyle') {
    genQuestion();
    updateQuestionUI();
    saveGameState();
  }
}));

$$('#trialPicker .strike-opt').forEach(o => o.addEventListener('click', () => {
  cfg.trialSecs = +o.dataset.val;
  saveCfg();
  syncSettingsUI();
  if (cfg.mode === 'trial') startGame();
  else updateBestBox();
}));

onToggle('togReadout', 'showReadout', updateModeUI);
onToggle('togLabels', 'showLabels', () => $('#board').classList.toggle('no-labels', !cfg.showLabels));
onToggle('togAutoClear', 'autoClear');
onToggle('togQuarterWire', 'quarterWire', buildAbacus);
onToggle('togRequireCheck', 'requireCheck', () => { updateModeUI(); updateQuestionUI(); });

/* ═══════════════════════════════════════════
   KEYBOARD (D10 fix)
   Arrow keys move a highlighted rod cursor; digit keys 0-9 set that
   rod directly to the matching decimal digit; C clears the board.
   This is a fast path for sighted keyboard users on top of (not
   instead of) the per-bead Tab/Enter/Space toggling wired in
   makeBeadAccessible() above, which is what screen-reader users
   actually navigate with.
═══════════════════════════════════════════ */
let keyCursor = null; // rod index highlighted for arrow/digit control

function setKeyCursor(idx) {
  const S = E.STYLES[cfg.style];
  keyCursor = clamp(idx, 0, S.rods - 1);
  rodEls.forEach((elm, i) => elm.classList.toggle('key-cursor', i === keyCursor));
}

function setRodDigit(rodIdx, digit) {
  const S = E.STYLES[cfg.style];
  if (S.kind === 'vertical') {
    rodState[rodIdx] = { h: digit >= 5 ? 1 : 0, e: digit % 5 };
  } else {
    rodState[rodIdx] = digit;
  }
}

document.addEventListener('keydown', e => {
  if (shouldIgnoreGameKeys(e)) return;
  if (e.key === 'ArrowLeft') {
    setKeyCursor((keyCursor === null ? 0 : keyCursor) - 1);
    e.preventDefault();
    return;
  }
  if (e.key === 'ArrowRight') {
    setKeyCursor((keyCursor === null ? -1 : keyCursor) + 1);
    e.preventDefault();
    return;
  }
  if (e.key >= '0' && e.key <= '9') {
    if (keyCursor === null) setKeyCursor(E.STYLES[cfg.style].rods - 1); // default to the ones rod
    setRodDigit(keyCursor, +e.key);
    onBeadMoved();
    e.preventDefault();
    return;
  }
  if (e.key === 'c' || e.key === 'C') {
    clearAbacus();
    e.preventDefault();
  }
});

/* ═══ BOOT ═══ */
syncTopBar();
if (!restoreGameState()) startGame();
