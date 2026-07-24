/* ═══════════════════════════════════════════
   Abacus — puzzle engine (pure, DOM-free)
   Board state, question generation, and layout math only: no
   rendering, no storage, no globals from the page. Loaded in the
   browser as `AbacusEngine` (before js/abacus.js) and require()-able
   from Node for the test suite:

     node tests/abacus-engine.test.js

   Keep this file free of document/window/localStorage references.
═══════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AbacusEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ═══════════════════════════════════════════
     ABACUS STYLES
     vertical kinds: heaven beads (×5) above the beam, earth beads (×1)
     below; a bead counts when pushed toward the beam. rows kind
     (schoty): N beads per wire, a bead counts when slid to the left.

     Geometry fields are in abstract units (1 unit = 1 bead height, see
     styleUnits/computeUnit below), not pixels — the board is scaled to
     fit the viewport at render time via a single CSS variable (--u).
       beadH/beadW : bead footprint (vertical: stacking pitch × width;
                     rows: bead diameter × horizontal pitch)
       rodW        : per-rod horizontal pitch (vertical kind only)
       beamH       : crossbar thickness (vertical kind only)
       rowH        : per-row vertical pitch (rows kind only)
       labelW      : place-label gutter width (rows kind only)
       padX/padY   : inner padding between the frame and the beads
       frame       : frame border thickness
  ═══════════════════════════════════════════ */
  const STYLES = {
    soroban: { kind: 'vertical', rods: 9, heaven: 1, earth: 4,
               beadH: 1, beadW: 2.0, rodW: 2.4, beamH: 0.62,
               padX: 0.3, padY: 0.22, frame: 0.26, name: 'Soroban' },
    suanpan: { kind: 'vertical', rods: 9, heaven: 2, earth: 5,
               beadH: 1, beadW: 1.8, rodW: 2.2, beamH: 0.62,
               padX: 0.3, padY: 0.22, frame: 0.26, name: 'Suanpan' },
    roman:   { kind: 'vertical', rods: 7, heaven: 1, earth: 4,
               beadH: 1, beadW: 1.0, rodW: 1.8, beamH: 0.7,
               padX: 0.3, padY: 0.22, frame: 0.3, name: 'Roman',
               labels: ['M̅', 'C̅', 'X̅', 'M', 'C', 'X', 'I'] },
    schoty:  { kind: 'rows', rods: 7, beads: 10,
               beadH: 1, beadW: 1.25, rowH: 1.35, labelW: 1.6,
               padX: 0.4, padY: 0.2, frame: 0.26, name: 'Schoty' },
  };

  const PLACE_NAMES = ['1', '10', '100', '1K', '10K', '100K', '1M', '10M', '100M'];

  function placeLabel(rodIdx, S) {
    if (S.labels) return S.labels[rodIdx];
    return PLACE_NAMES[S.rods - 1 - rodIdx] || '';
  }

  /* ═══════════════════════════════════════════
     RESPONSIVE SCALING
     styleUnits() reports a style's board footprint in abstract units.
     computeUnit() finds the largest px-per-unit that fits an available
     box without exceeding it on either axis, clamped to [min, max].
  ═══════════════════════════════════════════ */
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function styleUnits(style, styles) {
    const S = (styles || STYLES)[style];
    if (S.kind === 'vertical') {
      const stackH = (S.heaven + 1) * S.beadH + S.beamH + (S.earth + 1) * S.beadH;
      return {
        w: S.rods * S.rodW + 2 * S.padX + 2 * S.frame,
        h: stackH + 2 * S.padY + 2 * S.frame,
      };
    }
    return {
      w: (S.beads + 4) * S.beadW + S.labelW + 2 * S.padX + 2 * S.frame,
      h: S.rods * S.rowH + 2 * S.padY + 2 * S.frame,
    };
  }

  function computeUnit(availW, availH, style, opts, styles) {
    opts = opts || {};
    const min = opts.min !== undefined ? opts.min : 9;
    const max = opts.max !== undefined ? opts.max : 46;
    const u = styleUnits(style, styles);
    const raw = Math.min(availW / u.w, availH / u.h);
    return clamp(raw, min, max);
  }

  /* ═══════════════════════════════════════════
     DIFFICULTY LEVELS
     add: operand range for +/− chains. mul: range of the first two
     factors; mulChain: range of extra chain factors (kept small so long
     chains stay on the board). div: divisor range; divAns: quotient
     range (division is built backwards so it always divides evenly).
  ═══════════════════════════════════════════ */
  const LEVELS = {
    easy:   { add: [1, 9],      mul: [2, 5],  mulChain: [2, 3], div: [2, 5],  divAns: [1, 9]   },
    medium: { add: [1, 99],     mul: [2, 9],  mulChain: [2, 4], div: [2, 9],  divAns: [2, 12]  },
    hard:   { add: [10, 999],   mul: [3, 12], mulChain: [2, 5], div: [3, 12], divAns: [3, 25]  },
    expert: { add: [100, 9999], mul: [6, 25], mulChain: [2, 6], div: [4, 20], divAns: [10, 99] },
  };

  /* ═══════════════════════════════════════════
     BOARD STATE
     vertical: [{h, e}, ...] active-bead counts per rod.
     rows (schoty): [count, ...] active-bead count per wire.
  ═══════════════════════════════════════════ */
  function freshState(style, styles) {
    const S = (styles || STYLES)[style];
    return S.kind === 'vertical'
      ? Array.from({ length: S.rods }, () => ({ h: 0, e: 0 }))
      : Array.from({ length: S.rods }, () => 0);
  }

  function abacusValue(state, style, styles) {
    const S = (styles || STYLES)[style];
    let v = 0;
    for (let r = 0; r < S.rods; r++) {
      const place = S.rods - 1 - r;
      const digit = S.kind === 'vertical' ? state[r].h * 5 + state[r].e : state[r];
      v += digit * Math.pow(10, place);
    }
    return v;
  }

  function maxBoardValue(style, styles) {
    return Math.pow(10, (styles || STYLES)[style].rods) - 1;
  }

  /* Build a board state whose abacusValue() equals n. Assumes
     0 <= n <= maxBoardValue(style); higher digits are simply 0. */
  function setValue(n, style, styles) {
    const S = (styles || STYLES)[style];
    const state = freshState(style, styles);
    let rem = n;
    for (let r = S.rods - 1; r >= 0; r--) {
      const digit = rem % 10;
      rem = Math.floor(rem / 10);
      if (S.kind === 'vertical') {
        state[r] = { h: digit >= 5 ? 1 : 0, e: digit % 5 };
      } else {
        state[r] = digit;
      }
    }
    return state;
  }

  /* Prefix toggle: clicking bead index i on a group sets the group's
     active count to i (retract) if the bead is already active
     (count > i), otherwise to i + 1 (extend). group is 'h'/'e' for
     vertical rods, or null for a schoty row. Returns a new state array;
     does not mutate the input. */
  function toggleBead(state, style, rodIdx, group, i, styles) {
    const S = (styles || STYLES)[style];
    const next = state.map(r => (S.kind === 'vertical' ? { h: r.h, e: r.e } : r));
    if (S.kind === 'vertical') {
      const cur = next[rodIdx][group];
      next[rodIdx][group] = (i < cur) ? i : i + 1;
    } else {
      const cur = next[rodIdx];
      next[rodIdx] = (i < cur) ? i : i + 1;
    }
    return next;
  }

  /* ═══════════════════════════════════════════
     QUESTION GENERATION
     rng: () => [0,1) — injected so generation is deterministic under
     test and non-deterministic (Math.random) in production.
  ═══════════════════════════════════════════ */
  function randInt(rng, a, b) { return a + Math.floor(rng() * (b - a + 1)); }
  function rr(rng, range) { return randInt(rng, range[0], range[1]); }
  function fmt(n) { return n.toLocaleString('en-US'); }

  const OP_SYMBOLS = { add: ' + ', sub: ' − ', mul: ' × ', div: ' ÷ ' };

  function genQuestion(cfg, rng, styles) {
    const S = (styles || STYLES)[cfg.style];
    const enabled = ['add', 'sub', 'mul', 'div'].filter(o => cfg.ops[o]);
    const op = enabled.length ? enabled[randInt(rng, 0, enabled.length - 1)] : 'add';
    const L = LEVELS[cfg.difficulty] || LEVELS.easy;
    const n = Math.max(2, cfg.chainLen);
    const cap = maxBoardValue(cfg.style, styles);
    let nums = [], answer = 0;

    if (op === 'add') {
      for (let i = 0; i < n; i++) nums.push(rr(rng, L.add));
      answer = nums.reduce((a, b) => a + b, 0);
      // guaranteed-safe fallback: if the board is too small for this
      // difficulty's range, clamp to the smallest chain that still fits
      if (answer > cap) { nums = Array.from({ length: n }, () => 1); answer = n; }
    } else if (op === 'sub') {
      const terms = [];
      for (let i = 0; i < n - 1; i++) terms.push(rr(rng, L.add));
      const tsum = terms.reduce((a, b) => a + b, 0);
      const start = tsum + rr(rng, L.add);
      nums = [start, ...terms];
      answer = start - tsum;
      if (start > cap) {
        // smallest guaranteed-nonnegative chain: n-1 ones subtracted from n
        const t2 = Array.from({ length: n - 1 }, () => 1);
        nums = [n, ...t2];
        answer = n - (n - 1);
      }
    } else if (op === 'mul') {
      let found = false;
      for (let t = 0; t < 40; t++) {
        nums = [rr(rng, L.mul), rr(rng, L.mul)];
        for (let i = 2; i < n; i++) nums.push(rr(rng, L.mulChain));
        answer = nums.reduce((a, b) => a * b, 1);
        if (answer <= cap) { found = true; break; }
      }
      if (!found) {
        // guaranteed to fit any board with cap >= 2^n: all factors of 2
        nums = Array.from({ length: n }, () => 2);
        answer = Math.pow(2, n);
        if (answer > cap) { nums = Array.from({ length: n }, () => 1); answer = 1; }
      }
    } else {
      let found = false;
      for (let t = 0; t < 40; t++) {
        answer = rr(rng, L.divAns);
        const divs = [rr(rng, L.div)];
        for (let i = 2; i < n; i++) divs.push(rr(rng, L.mulChain));
        const start = answer * divs.reduce((a, b) => a * b, 1);
        if (start <= cap) { nums = [start, ...divs]; found = true; break; }
      }
      if (!found) {
        // guaranteed to fit: dividend n, divided by 1 (n-1) times
        nums = [n, ...Array.from({ length: n - 1 }, () => 1)];
        answer = n;
        if (answer > cap) { nums = [1, ...Array.from({ length: n - 1 }, () => 1)]; answer = 1; }
      }
    }

    return { op, answer, text: nums.map(fmt).join(OP_SYMBOLS[op]) + ' =' };
  }

  /* ═══════════════════════════════════════════
     BEST-SCORE KEY (D2 fix)
     Distinguishes trials by difficulty, duration, chain length and the
     enabled-operation set, so scores earned under different question
     shapes never collide in the same "Best" slot.
  ═══════════════════════════════════════════ */
  function bestKey(cfg) {
    const opsOn = ['add', 'sub', 'mul', 'div'].filter(o => cfg.ops && cfg.ops[o]).sort().join('') || 'none';
    return `trial-${cfg.difficulty}-${cfg.trialSecs}-c${cfg.chainLen}-${opsOn}`;
  }

  return {
    STYLES, LEVELS, PLACE_NAMES, placeLabel,
    freshState, abacusValue, maxBoardValue, setValue, toggleBead,
    genQuestion, bestKey,
    styleUnits, computeUnit,
  };
});
