/* ═══════════════════════════════════════════
   SETTINGS STATE  (persisted to localStorage)
═══════════════════════════════════════════ */
const DEFAULTS = {
  difficulty:  'easy',
  mode:        'practice',   // freestyle | practice | flow | trial
  style:       'soroban',    // soroban | suanpan | roman | schoty
  frame:       'theme',      // theme | wood | dark | brass
  ops:         { add: true, sub: true, mul: false, div: false },
  chainLen:    2,            // operands per question: 2 = a+b, 4 = a+b+c+d
  trialSecs:   60,
  showReadout: true,
  showLabels:  true,
  autoClear:   true,
};

let cfg = Object.assign({}, DEFAULTS, loadJSON('abacus-cfg', {}));
cfg.ops = Object.assign({}, DEFAULTS.ops, cfg.ops || {});
function saveCfg() { saveJSON('abacus-cfg', cfg); }

/* ═══════════════════════════════════════════
   ABACUS STYLES
   vertical kinds: heaven beads (×5) above the beam, earth beads (×1)
   below; a bead counts when pushed toward the beam. rows kind (schoty):
   10 beads per wire, a bead counts when slid to the left.
   Bead geometry lives here (px) because positions are computed in JS.
═══════════════════════════════════════════ */
const STYLES = {
  soroban: { kind: 'vertical', rods: 9, heaven: 1, earth: 4, bw: 52, bh: 26, rodW: 62, beamH: 16, name: 'Soroban' },
  suanpan: { kind: 'vertical', rods: 9, heaven: 2, earth: 5, bw: 46, bh: 24, rodW: 58, beamH: 16, name: 'Suanpan' },
  roman:   { kind: 'vertical', rods: 7, heaven: 1, earth: 4, bw: 24, bh: 24, rodW: 46, beamH: 18, name: 'Roman',
             labels: ['M̅', 'C̅', 'X̅', 'M', 'C', 'X', 'I'] },
  schoty:  { kind: 'rows', rods: 7, beads: 10, bw: 32, bh: 24, rowH: 34, name: 'Schoty' },
};

const PLACE_NAMES = ['1', '10', '100', '1K', '10K', '100K', '1M', '10M', '100M'];

function placeLabel(rodIdx, S) {
  if (S.labels) return S.labels[rodIdx];
  return PLACE_NAMES[S.rods - 1 - rodIdx] || '';
}

/* ═══════════════════════════════════════════
   DIFFICULTY LEVELS
   add: operand range for +/− chains. mul: range of the first two
   factors; mulChain: range of extra chain factors (kept small so long
   chains stay on the board). div: divisor range; divAns: quotient range
   (division is built backwards so it always divides evenly).
═══════════════════════════════════════════ */
const LEVELS = {
  easy:   { add: [1, 9],      mul: [2, 5],  mulChain: [2, 3], div: [2, 5],  divAns: [1, 9]   },
  medium: { add: [1, 99],     mul: [2, 9],  mulChain: [2, 4], div: [2, 9],  divAns: [2, 12]  },
  hard:   { add: [10, 999],   mul: [3, 12], mulChain: [2, 5], div: [3, 12], divAns: [3, 25]  },
  expert: { add: [100, 9999], mul: [6, 25], mulChain: [2, 6], div: [4, 20], divAns: [10, 99] },
};

/* ═══════════════════════════════════════════
   GAME STATE
═══════════════════════════════════════════ */
let rodState = [];      // vertical: [{h, e}] active-bead counts; rows: [count]
let beadRefs = [];      // DOM refs, same shape as rodState
let question = null;    // { op, answer, text }
let solved = 0, attempts = 0;
let seconds = 0;        // count-up timer (practice / flow)
let trialLeft = 0;      // countdown remaining (trial)
let trialRunning = false;
let timerInterval = null;
let flowTimer = null;   // debounce for auto-check confirmation
let gameOver = false;   // trial ended
let checking = false;   // practice: correct-flash in progress

function randInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
function rr(range) { return randInt(range[0], range[1]); }
function fmt(n) { return n.toLocaleString('en-US'); }

function freshState() {
  const S = STYLES[cfg.style];
  return S.kind === 'vertical'
    ? Array.from({ length: S.rods }, () => ({ h: 0, e: 0 }))
    : Array.from({ length: S.rods }, () => 0);
}

function abacusValue() {
  const S = STYLES[cfg.style];
  let v = 0;
  for (let r = 0; r < S.rods; r++) {
    const place = S.rods - 1 - r;
    const digit = S.kind === 'vertical' ? rodState[r].h * 5 + rodState[r].e : rodState[r];
    v += digit * Math.pow(10, place);
  }
  return v;
}

function maxBoardValue() { return Math.pow(10, STYLES[cfg.style].rods) - 1; }

/* ═══════════════════════════════════════════
   BOARD BUILD + RENDER
═══════════════════════════════════════════ */
function el(cls) { const d = document.createElement('div'); d.className = cls; return d; }

function buildAbacus() {
  const S = STYLES[cfg.style];
  const board = $('#board');
  board.dataset.abacus = cfg.style;
  board.dataset.frame = cfg.frame;
  board.classList.toggle('no-labels', !cfg.showLabels);
  board.innerHTML = '';
  beadRefs = [];

  const ab = el('abacus ' + (S.kind === 'vertical' ? 'vertical' : 'rows'));

  if (S.kind === 'vertical') {
    const heavenH = (S.heaven + 1) * S.bh;
    const earthH = (S.earth + 1) * S.bh;
    const rodH = heavenH + S.beamH + earthH;
    for (let r = 0; r < S.rods; r++) {
      const rod = el('rod');
      rod.style.width = S.rodW + 'px';
      rod.style.height = rodH + 'px';
      rod.appendChild(el('wire'));

      const beam = el('beam-seg');
      beam.style.top = heavenH + 'px';
      beam.style.height = S.beamH + 'px';
      beam.textContent = placeLabel(r, S);
      rod.appendChild(beam);

      const refs = { h: [], e: [] };
      for (let i = 0; i < S.heaven; i++) {
        const b = el('bead');
        b.style.width = S.bw + 'px';
        b.style.height = S.bh + 'px';
        b.addEventListener('click', () => {
          const st = rodState[r];
          st.h = (i < st.h) ? i : i + 1;
          onBeadMoved();
        });
        refs.h.push(b);
        rod.appendChild(b);
      }
      for (let i = 0; i < S.earth; i++) {
        const b = el('bead');
        b.style.width = S.bw + 'px';
        b.style.height = S.bh + 'px';
        b.addEventListener('click', () => {
          const st = rodState[r];
          st.e = (i < st.e) ? i : i + 1;
          onBeadMoved();
        });
        refs.e.push(b);
        rod.appendChild(b);
      }
      beadRefs.push(refs);
      ab.appendChild(rod);
    }
  } else {
    const W = (S.beads + 4) * S.bw;
    for (let r = 0; r < S.rods; r++) {
      const row = el('srow');
      row.style.width = W + 'px';
      row.style.height = S.rowH + 'px';
      row.appendChild(el('wire'));

      const lab = el('row-label');
      lab.textContent = placeLabel(r, S);
      row.appendChild(lab);

      const refs = [];
      for (let i = 0; i < S.beads; i++) {
        // the two middle beads are traditionally coloured to spot 4|5 at a glance
        const b = el('bead' + ((i === 4 || i === 5) ? ' mid' : ''));
        b.style.width = (S.bw - 5) + 'px';
        b.style.height = S.bh + 'px';
        b.addEventListener('click', () => {
          rodState[r] = (i < rodState[r]) ? i : i + 1;
          onBeadMoved();
        });
        refs.push(b);
        row.appendChild(b);
      }
      beadRefs.push(refs);
      ab.appendChild(row);
    }
  }
  board.appendChild(ab);
  renderBeads();
}

function renderBeads() {
  const S = STYLES[cfg.style];
  if (S.kind === 'vertical') {
    const heavenH = (S.heaven + 1) * S.bh;
    const earthTop = heavenH + S.beamH;
    for (let r = 0; r < S.rods; r++) {
      const st = rodState[r], refs = beadRefs[r];
      refs.h.forEach((b, i) => {
        // heaven bead i (0 = nearest beam): active rests on the beam
        b.style.top = (i < st.h ? heavenH - (i + 1) * S.bh : heavenH - (i + 2) * S.bh) + 'px';
        b.classList.toggle('set', i < st.h);
      });
      refs.e.forEach((b, i) => {
        b.style.top = (i < st.e ? earthTop + i * S.bh : earthTop + (i + 1) * S.bh) + 'px';
        b.classList.toggle('set', i < st.e);
      });
    }
  } else {
    const W = (S.beads + 4) * S.bw;
    for (let r = 0; r < S.rods; r++) {
      beadRefs[r].forEach((b, i) => {
        b.style.left = (i < rodState[r] ? i * S.bw : W - (S.beads - i) * S.bw) + 'px';
        b.classList.toggle('set', i < rodState[r]);
      });
    }
  }
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
   QUESTION GENERATION
═══════════════════════════════════════════ */
function genQuestion() {
  const enabled = ['add', 'sub', 'mul', 'div'].filter(o => cfg.ops[o]);
  const op = enabled.length ? enabled[randInt(0, enabled.length - 1)] : 'add';
  const L = LEVELS[cfg.difficulty] || LEVELS.easy;
  const n = Math.max(2, cfg.chainLen);
  const cap = maxBoardValue();
  let nums = [], answer = 0, sym = '';

  if (op === 'add') {
    for (let i = 0; i < n; i++) nums.push(rr(L.add));
    answer = nums.reduce((a, b) => a + b, 0);
    sym = ' + ';
  } else if (op === 'sub') {
    // start is padded above the sum of the terms so the answer stays ≥ 1
    const terms = [];
    for (let i = 0; i < n - 1; i++) terms.push(rr(L.add));
    const tsum = terms.reduce((a, b) => a + b, 0);
    const start = tsum + rr(L.add);
    nums = [start, ...terms];
    answer = start - tsum;
    sym = ' − ';
  } else if (op === 'mul') {
    for (let t = 0; t < 40; t++) {
      nums = [rr(L.mul), rr(L.mul)];
      for (let i = 2; i < n; i++) nums.push(rr(L.mulChain));
      answer = nums.reduce((a, b) => a * b, 1);
      if (answer <= cap) break;
    }
    sym = ' × ';
  } else {
    // built backwards: quotient × divisors = dividend, so it always divides evenly
    for (let t = 0; t < 40; t++) {
      answer = rr(L.divAns);
      const divs = [rr(L.div)];
      for (let i = 2; i < n; i++) divs.push(rr(L.mulChain));
      const start = answer * divs.reduce((a, b) => a * b, 1);
      if (start <= cap) { nums = [start, ...divs]; break; }
    }
    sym = ' ÷ ';
  }

  question = { op, answer, text: nums.map(fmt).join(sym) + ' =' };
}

/* ═══════════════════════════════════════════
   MODES / SESSION FLOW
═══════════════════════════════════════════ */
function defaultFeedback() {
  if (cfg.mode === 'practice') return 'Set the answer on the abacus, then hit Check.';
  if (cfg.mode === 'flow') return 'It advances by itself the moment the abacus is right.';
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
  $('#questionBar').classList.toggle('hidden', m === 'freestyle');
  $('#actionRow').classList.toggle('hidden', m === 'freestyle');
  $('#checkBtn').classList.toggle('hidden', m !== 'practice');
  $('#revealBtn').classList.toggle('hidden', m !== 'practice');
  $('#solvedBox').classList.toggle('hidden', m === 'freestyle');
  $('#timerBox').classList.toggle('hidden', m === 'freestyle');
  $('#bestBox').classList.toggle('hidden', m !== 'trial');
  $('#readout').classList.toggle('hidden', !(cfg.showReadout || m === 'freestyle'));
}

function updateStats() { $('#solved').textContent = solved; }

function updateTimerDisplay() {
  $('#timer').textContent = formatTime(cfg.mode === 'trial' ? Math.max(0, trialLeft) : seconds);
}

function bestKey() { return `trial-${cfg.difficulty}-${cfg.trialSecs}`; }

function updateBestBox() {
  const b = loadJSON('abacus-best', {})[bestKey()];
  $('#best').textContent = (b === undefined) ? '–' : b;
}

function stopTimer() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
}

function startTimer() {
  stopTimer();
  timerInterval = setInterval(() => {
    seconds++;
    updateTimerDisplay();
    if (seconds % 5 === 0) saveGameState();
  }, 1000);
}

function startTrialCountdown() {
  trialRunning = true;
  $('#feedback').textContent = 'Go!';
  stopTimer();
  timerInterval = setInterval(() => {
    trialLeft--;
    updateTimerDisplay();
    if (trialLeft <= 0) endTrial();
    else if (trialLeft % 5 === 0) saveGameState();
  }, 1000);
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
  solved = 0; attempts = 0; seconds = 0;
  trialLeft = cfg.trialSecs;
  trialRunning = false;
  if (flowTimer) { clearTimeout(flowTimer); flowTimer = null; }
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
  if (cfg.mode === 'practice' || cfg.mode === 'flow') startTimer();
  saveGameState();
}

function nextQuestion() {
  checking = false;
  if (cfg.autoClear) {
    rodState = freshState();
    renderBeads();
    updateReadout();
  }
  genQuestion();
  updateQuestionUI();
  saveGameState();
}

function checkAnswer() {
  if (!question || gameOver || checking) return;
  attempts++;
  const v = abacusValue();
  const bar = $('#questionBar');
  if (v === question.answer) {
    checking = true;
    solved++;
    updateStats();
    bar.classList.remove('wrong');
    bar.classList.add('correct');
    $('#feedback').textContent = '✓ Correct!';
    setTimeout(() => { bar.classList.remove('correct'); nextQuestion(); }, 800);
  } else {
    bar.classList.remove('wrong');
    void bar.offsetWidth; /* restart the shake animation */
    bar.classList.add('wrong');
    $('#feedback').textContent = `Not yet — the abacus reads ${fmt(v)}.`;
    setTimeout(() => bar.classList.remove('wrong'), 400);
  }
  saveGameState();
}

function reveal() {
  if (!question || gameOver) return;
  $('#feedback').textContent = `Answer: ${fmt(question.answer)} — set it on the abacus, then Check or Skip.`;
}

/* auto-check (flow + trial): the value must hold for 450ms so passing
   through the answer mid-move doesn't trigger an advance */
function flowCheck() {
  if (!(cfg.mode === 'flow' || cfg.mode === 'trial') || !question || gameOver) return;
  if (flowTimer) { clearTimeout(flowTimer); flowTimer = null; }
  if (abacusValue() === question.answer) {
    flowTimer = setTimeout(() => {
      flowTimer = null;
      if (gameOver) return;
      solved++;
      attempts++;
      updateStats();
      const bar = $('#questionBar');
      bar.classList.add('correct');
      setTimeout(() => bar.classList.remove('correct'), 450);
      nextQuestion();
    }, 450);
  }
}

/* ═══════════════════════════════════════════
   PERSIST + RESTORE
═══════════════════════════════════════════ */
function saveGameState() {
  pushHistory('abacus-history', {
    style: cfg.style, mode: cfg.mode,
    rodState, question,
    solved, attempts, seconds, trialLeft,
    trialStarted: trialRunning, gameOver,
  });
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
  const S = STYLES[cfg.style];
  if (!s || s.style !== cfg.style || s.mode !== cfg.mode) return false;
  if (!validState(s.rodState, S)) return false;

  rodState = s.rodState;
  question = (s.question && typeof s.question.answer === 'number') ? s.question : null;
  solved = s.solved | 0;
  attempts = s.attempts | 0;
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

  if (!gameOver && (cfg.mode === 'practice' || cfg.mode === 'flow')) startTimer();
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
  $$('#chainPicker .strike-opt').forEach(o => o.classList.toggle('active', +o.dataset.val === cfg.chainLen));
  $$('#trialPicker .strike-opt').forEach(o => o.classList.toggle('active', +o.dataset.val === cfg.trialSecs));
  $$('[data-abacus-pick]').forEach(r => r.classList.toggle('selected', r.dataset.abacusPick === cfg.style));
  $$('[data-frame-pick]').forEach(r => r.classList.toggle('selected', r.dataset.framePick === cfg.frame));
}

function onToggle(id, key, extra) {
  $('#' + id).addEventListener('change', e => {
    cfg[key] = e.target.checked;
    saveCfg();
    if (extra) extra();
  });
}

function syncTopBar() {
  $('#modeSelect').value = cfg.mode;
  $('#difficultySelect').value = cfg.difficulty;
  $$('.op-chip').forEach(c => c.classList.toggle('active', !!cfg.ops[c.dataset.op]));
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

$('#modeSelect').addEventListener('change', e => {
  cfg.mode = e.target.value;
  saveCfg();
  startGame();
});
$('#difficultySelect').addEventListener('change', e => {
  cfg.difficulty = e.target.value;
  saveCfg();
  startGame();
});

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
  cfg.style = r.dataset.abacusPick;
  saveCfg();
  rodState = freshState();
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

/* ═══ BOOT ═══ */
syncTopBar();
if (!restoreGameState()) startGame();
