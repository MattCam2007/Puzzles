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
      w: (S.beads + 1) * S.beadW + S.labelW + 2 * S.padX + 2 * S.frame,
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

  /* ═══════════════════════════════════════════
     KINETIC BEADS — pure 1D track physics for one group (the heaven
     beads on a rod, the earth beads on a rod, or one schoty row).
     Position 0 = touching the active wall; position increases moving
     away from it. A bead's rest position (not being dragged) is
     index * beadSize if it's active (index < count), or
     (index + 1) * beadSize if it's inactive — the same one-slot gap
     js/abacus.js's renderBeads() already draws between the active and
     inactive clusters (without it, toggling a bead would never actually
     move it, which defeats the point of a kinetic abacus). The mapping
     from this abstract "distance from wall" back to actual screen
     top/left per group type is a rendering concern in js/abacus.js, not
     here.
  ═══════════════════════════════════════════ */

  function _restPos(i, count, beadSize) {
    return (i < count ? i : i + 1) * beadSize;
  }

  /* Which bead the pointer is actually over, given a track position.
     Beads do NOT tile the track uniformly: with `count` active, slots
     0..count-1 hold the active beads, slot `count` is the empty gap,
     and slots count+1..groupSize hold the inactive ones. Ignoring that
     gap (or rounding instead of flooring) makes a press land on a
     different bead than the one under the finger — off by one at the
     gap, off by two past it. */
  function beadIndexAtTrack(t, count, groupSize, beadSize) {
    const slot = clamp(Math.floor(t / beadSize), 0, groupSize);
    if (slot < count) return slot;
    if (slot > count) return clamp(slot - 1, 0, groupSize - 1);
    // exactly in the gap — grab whichever neighbouring cluster is nearer
    if (count > 0 && (t - count * beadSize) < beadSize / 2) return count - 1;
    return clamp(count, 0, groupSize - 1);
  }

  /* The active count implied by having dragged bead `dragIndex` to
     `beadPos`. Because a drag shoves the beads ahead of it and cannot
     pull the ones behind, grabbing bead i can only ever resolve to
     i active-beads-before-it (pushed away from the wall) or i+1 (pushed
     toward it) — so the decision is just which rest slot the dragged
     bead ended up nearer. This is what makes a drag predictable: what
     you see the grabbed bead do is exactly what you get. Sweeping the
     whole group still works naturally — drag the outermost bead to the
     wall and every bead ahead of it is shoved along too. */
  function countFromDrag(beadPos, dragIndex, beadSize) {
    return beadPos < (dragIndex + 0.5) * beadSize ? dragIndex + 1 : dragIndex;
  }

  /* Free (unquantised) positions of every bead in a group — currently
     at `count` active — while bead dragIndex is being dragged to
     dragPos. The dragged bead follows the pointer exactly (clamped to
     the track); beads between it and whichever wall it's moving toward
     get shoved along so no two beads ever sit closer than beadSize
     apart; beads on the other side (which a real abacus can't pull
     along) stay put at their own rest position. Passing `count` (rather
     than assuming a gapless track) means the very first frame of a drag
     — before the pointer has moved at all — reproduces renderBeads()'s
     rest positions exactly, so there's no phantom jump when a drag
     begins. All arguments are primitives, so there is no shared mutable
     state to worry about — each call returns a fresh array. */
  function shovePositions(count, groupSize, dragIndex, dragPos, beadSize) {
    const trackMax = groupSize * beadSize;
    const positions = new Array(groupSize);
    positions[dragIndex] = clamp(dragPos, 0, trackMax);
    for (let i = dragIndex - 1; i >= 0; i--) {
      positions[i] = Math.min(_restPos(i, count, beadSize), positions[i + 1] - beadSize);
    }
    for (let i = dragIndex + 1; i < groupSize; i++) {
      positions[i] = Math.max(_restPos(i, count, beadSize), positions[i - 1] + beadSize);
    }
    return positions;
  }

  /* ═══════════════════════════════════════════
     CONFIG MIGRATION — collapses the v1 four-mode shape (freestyle /
     practice / flow / trial, with practice always Check-button-gated)
     down to three modes (freestyle / practice / trial) plus a single
     requireCheck toggle: v1's "flow" becomes practice with
     requireCheck: false (auto-advance), and v1's button-based practice
     becomes practice with requireCheck: false too, since auto-advance
     is now the default behaviour rather than a separate mode. Also
     back-fills the Phase 5 appearance keys for a config saved before
     they existed. Idempotent and does not mutate its input.
  ═══════════════════════════════════════════ */
  function migrateCfg(oldCfg) {
    const c = Object.assign({}, oldCfg);
    if (c.mode === 'flow') c.mode = 'practice';
    if (c.mode !== 'freestyle' && c.mode !== 'practice' && c.mode !== 'trial') c.mode = 'practice';
    if (typeof c.requireCheck !== 'boolean') c.requireCheck = false;
    if (typeof c.beadShape !== 'string') c.beadShape = 'auto';
    if (typeof c.beadMaterial !== 'string') c.beadMaterial = 'themed';
    return c;
  }

  /* ═══════════════════════════════════════════
     APPEARANCE — bead shape, bead material and board finish are three
     independent axes (mechanics — rod/bead counts, arithmetic — stay
     entirely determined by `style`). CSS keys off these ids directly
     ([data-bead-shape], [data-bead-material], [data-frame] in
     css/abacus.css); shape rules only ever set geometry and material
     rules only ever set colour, so any combination renders cleanly.
  ═══════════════════════════════════════════ */
  const SHAPES = [
    { id: 'auto',           label: 'Style default',  icon: '✨' },
    { id: 'biconical',      label: 'Biconical',       icon: '💠' },
    { id: 'soft-biconical', label: 'Soft biconical',  icon: '🔷' },
    { id: 'oblate',         label: 'Oblate',          icon: '⬭'  },
    { id: 'sphere',         label: 'Sphere',          icon: '⚪' },
    { id: 'barrel',         label: 'Barrel',          icon: '🛢️' },
    { id: 'lentil',         label: 'Lentil',          icon: '🫘' },
    { id: 'faceted',        label: 'Faceted',         icon: '💎' },
    { id: 'pebble',         label: 'Pebble',          icon: '🪨' },
  ];

  const MATERIALS = [
    { id: 'themed',     label: 'Match app theme', icon: '🎨' },
    { id: 'dark-wood',  label: 'Dark wood',        icon: '🟤' },
    { id: 'light-wood', label: 'Light wood',       icon: '🟠' },
    { id: 'ivory',      label: 'Ivory',            icon: '🤍' },
    { id: 'jade',       label: 'Jade',             icon: '🟢' },
    { id: 'brass',      label: 'Brass',            icon: '🟡' },
    { id: 'obsidian',   label: 'Obsidian',         icon: '⚫' },
    { id: 'amber',      label: 'Amber',            icon: '🔶' },
  ];

  const FRAMES = [
    { id: 'theme',    label: 'Match app theme', icon: '🎨' },
    { id: 'wood',     label: 'Classic wood',     icon: '🪵' },
    { id: 'dark',     label: 'Dark lacquer',     icon: '🖤' },
    { id: 'brass',    label: 'Antique brass',    icon: '🥇' },
    { id: 'walnut',   label: 'Walnut',           icon: '🌰' },
    { id: 'bamboo',   label: 'Bamboo',           icon: '🎍' },
    { id: 'rosewood', label: 'Rosewood',         icon: '🌹' },
    { id: 'slate',    label: 'Slate',            icon: '🪨' },
  ];

  const AUTO_SHAPE_BY_STYLE = { soroban: 'biconical', suanpan: 'oblate', schoty: 'sphere', roman: 'pebble' };

  /* 'auto' resolves to the style's traditional bead shape; any explicit
     choice always wins over that default. */
  function resolveBeadShape(style, beadShape) {
    if (beadShape && beadShape !== 'auto') return beadShape;
    return AUTO_SHAPE_BY_STYLE[style] || 'biconical';
  }

  return {
    STYLES, LEVELS, PLACE_NAMES, placeLabel,
    freshState, abacusValue, maxBoardValue, setValue, toggleBead,
    genQuestion, bestKey,
    styleUnits, computeUnit,
    beadIndexAtTrack, shovePositions, countFromDrag,
    migrateCfg,
    SHAPES, MATERIALS, FRAMES, resolveBeadShape,
  };
});
