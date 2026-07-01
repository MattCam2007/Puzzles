/* ═══════════════════════════════════════════
   Logic Grid — puzzle engine (pure, DOM-free)
   Generation and solving only: no rendering, no storage, no globals
   from the page. Loaded in the browser as `LogicEngine` (before
   js/logic.js) and require()-able from Node for the test suite:

     node tests/logic-engine.test.js

   Keep this file free of document/window/localStorage references.
═══════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LogicEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ── DIFFICULTY TIERS ── */
  const LEVELS = {
    easy:   { items: 4, cats: 3, palette: 'easy' },
    medium: { items: 4, cats: 4, palette: 'balanced' },
    hard:   { items: 5, cats: 4, palette: 'hard' },
    expert: { items: 5, cats: 5, palette: 'expert' },
  };

  /* allowed clue types + preference order (earlier = tried first when building).
     Positives are listed LAST everywhere: leading with them lets the greedy
     builder pin the whole grid by direct lookup, which makes the puzzle a
     data-entry exercise with no deduction. Relational/negative clues force
     real reasoning; a few positives are added back only as gentle anchors. */
  const PALETTES = {
    easy:     ['relational', 'negative', 'positive'],
    balanced: ['relational', 'negative', 'positive'],
    hard:     ['comparative', 'relational', 'negative', 'positive'],
    expert:   ['comparative', 'relational', 'negative'],
  };

  /* ── DATA POOLS (≥5 values each; ordinal flag on ordered categories) ── */
  const ANCHOR = 'Name';

  const CATEGORY_POOL = [
    { name: 'Job',     values: ['Teacher', 'Chef', 'Pilot', 'Doctor', 'Artist'] },
    { name: 'Pet',     values: ['Cat', 'Dog', 'Rabbit', 'Parrot', 'Turtle'] },
    { name: 'City',    values: ['Oslo', 'Cairo', 'Kyoto', 'Lima', 'Perth'] },
    { name: 'Drink',   values: ['Coffee', 'Tea', 'Juice', 'Water', 'Cocoa'] },
    { name: 'Hobby',   values: ['Painting', 'Climbing', 'Coding', 'Baking', 'Sailing'] },
    { name: 'Music',   values: ['Jazz', 'Folk', 'Classical', 'Punk', 'Soul'] },
    { name: 'Colour',  values: ['Red', 'Blue', 'Green', 'Yellow', 'Purple'] },
    { name: 'Sport',   values: ['Tennis', 'Swimming', 'Cycling', 'Boxing', 'Rowing'] },
    { name: 'Decade',  ordinal: true, values: ['1960s', '1970s', '1980s', '1990s', '2000s'] },
    { name: 'Age',     ordinal: true, values: ['21', '34', '47', '58', '63'] },
    { name: 'Floor',   ordinal: true, values: ['1st', '2nd', '3rd', '4th', '5th'] },
    { name: 'Finish',  ordinal: true, values: ['1st', '2nd', '3rd', '4th', '5th'] },
  ];

  const NAME_POOL = [
    ['Petra', 'Rhys', 'Sable', 'Coen', 'Mira'],
    ['Dorothea', 'Fenwick', 'Isla', 'Rook', 'Yael'],
    ['Stellan', 'Orla', 'Cassius', 'Noor', 'Birch'],
    ['Vesper', 'Tomasz', 'Lena', 'Rafferty', 'Dex'],
  ];

  /* ── helpers ── */
  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function low(s) { return s.toLowerCase(); }

  /* ═══════════════════════════════════════════
     GENERATION
  ═══════════════════════════════════════════ */
  function buildSolution(entities, attrCats) {
    const sol = {}, solIndex = {};
    solIndex[ANCHOR] = {};
    entities.forEach((e, i) => { solIndex[ANCHOR][e] = i; });
    attrCats.forEach(cat => {
      const vals = shuffle(cat.values);   // values length === N
      sol[cat.name] = vals.slice();
      solIndex[cat.name] = {};
      vals.forEach((v, i) => { solIndex[cat.name][v] = i; });
    });
    return { sol, solIndex };
  }

  function generateCandidates(entities, attrCats, sol, palette) {
    const N = entities.length;
    const allowed = new Set(PALETTES[palette]);
    const out = { positive: [], negative: [], relational: [], comparative: [] };

    // positive / negative
    entities.forEach((name, e) => {
      attrCats.forEach(cat => {
        const correct = sol[cat.name][e];
        if (allowed.has('positive')) {
          out.positive.push({
            type: 'positive', e, cat: cat.name, val: correct,
            text: `${name}'s ${low(cat.name)} is ${correct}.`,
          });
        }
        if (allowed.has('negative')) {
          // every wrong value is a candidate; the greedy builder samples from
          // the shuffled pool. (Emitting only one random wrong per cell used
          // to starve the builder and force expensive regeneration retries.)
          cat.values.forEach(w => {
            if (w === correct) return;
            out.negative.push({
              type: 'negative', e, cat: cat.name, val: w,
              text: `${name}'s ${low(cat.name)} is not ${w}.`,
            });
          });
        }
      });
    });

    // relational (every entity, every category pair)
    if (allowed.has('relational')) {
      attrCats.forEach((c1, i) => attrCats.forEach((c2, j) => {
        if (i >= j) return;
        entities.forEach((_, e) => {
          const v1 = sol[c1.name][e], v2 = sol[c2.name][e];
          out.relational.push({
            type: 'relational', cat1: c1.name, val1: v1, cat2: c2.name, val2: v2,
            text: `Whoever has ${low(c1.name)} ${v1} also has ${low(c2.name)} ${v2}.`,
          });
        });
      }));
    }

    // comparative (needs an ordinal category + a reference category)
    if (allowed.has('comparative')) {
      const ordCats = attrCats.filter(c => c.ordinal);
      ordCats.forEach(ord => {
        const refCat = attrCats.find(c => c.name !== ord.name);
        if (!refCat) return;
        const ordOrder = ord.values; // natural order
        for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) {
          if (a === b) continue;
          const ia = ordOrder.indexOf(sol[ord.name][a]);
          const ib = ordOrder.indexOf(sol[ord.name][b]);
          if (ia >= ib) continue; // emit only true "a earlier than b"
          out.comparative.push({
            type: 'comparative',
            refCat: refCat.name, refValA: sol[refCat.name][a], refValB: sol[refCat.name][b],
            ordCat: ord.name, ordValues: ordOrder,
            text: `The one with ${low(refCat.name)} ${sol[refCat.name][a]} has an earlier ` +
                  `${low(ord.name)} than the one with ${sol[refCat.name][b]}.`,
          });
        }
      });
    }
    return out;
  }

  function clueCats(cl) {
    if (cl.type === 'positive' || cl.type === 'negative') return [cl.cat];
    if (cl.type === 'relational') return [cl.cat1, cl.cat2];
    return [cl.refCat, cl.ordCat]; // comparative
  }

  /* Count solutions (capped at `limit`) consistent with all clues.
     Backtracks category-by-category, enumerating only bijections that
     respect the unary positive/negative constraints, pruning on every
     fully-assigned clue. count===1 ⇒ unique. */
  function countSolutions(entities, attrCats, clues, limit) {
    const N = entities.length;
    const forced = {}, forbidden = {};
    attrCats.forEach(c => {
      forced[c.name] = new Array(N).fill(null);
      forbidden[c.name] = Array.from({ length: N }, () => new Set());
    });
    for (const cl of clues) {
      if (cl.type === 'positive') {
        if (forced[cl.cat][cl.e] && forced[cl.cat][cl.e] !== cl.val) return 0;
        forced[cl.cat][cl.e] = cl.val;
      } else if (cl.type === 'negative') {
        forbidden[cl.cat][cl.e].add(cl.val);
      }
    }

    const assign = {};
    let count = 0;

    function checkClue(cl) {
      if (cl.type === 'positive')   return assign[cl.cat][cl.e] === cl.val;
      if (cl.type === 'negative')   return assign[cl.cat][cl.e] !== cl.val;
      if (cl.type === 'relational') return assign[cl.cat1].indexOf(cl.val1) === assign[cl.cat2].indexOf(cl.val2);
      // comparative
      const eA = assign[cl.refCat].indexOf(cl.refValA);
      const eB = assign[cl.refCat].indexOf(cl.refValB);
      return cl.ordValues.indexOf(assign[cl.ordCat][eA]) < cl.ordValues.indexOf(assign[cl.ordCat][eB]);
    }

    function permute(cat, cb) {
      const values = cat.values, fA = forced[cat.name], fb = forbidden[cat.name];
      const used = new Array(values.length).fill(false), cur = new Array(N);
      (function go(e) {
        if (count >= limit) return;
        if (e === N) { cb(cur.slice()); return; }
        for (let vi = 0; vi < values.length; vi++) {
          if (used[vi]) continue;
          const v = values[vi];
          if (fA[e] !== null && fA[e] !== v) continue;
          if (fb[e].has(v)) continue;
          used[vi] = true; cur[e] = v;
          go(e + 1);
          used[vi] = false;
          if (count >= limit) return;
        }
      })(0);
    }

    function recurse(ci, assignedNames) {
      if (count >= limit) return;
      if (ci === attrCats.length) { count++; return; }
      const cat = attrCats[ci];
      const nextNames = new Set(assignedNames); nextNames.add(cat.name);
      permute(cat, perm => {
        assign[cat.name] = perm;
        for (const cl of clues) {
          const cc = clueCats(cl);
          if (cc.includes(cat.name) && cc.every(c => nextNames.has(c))) {
            if (!checkClue(cl)) return;
          }
        }
        recurse(ci + 1, nextNames);
      });
      assign[cat.name] = undefined;
    }
    recurse(0, new Set());
    return count;
  }

  function isUnique(entities, attrCats, clues) {
    return countSolutions(entities, attrCats, clues, 2) === 1;
  }

  /* ═══════════════════════════════════════════
     DEDUCTION SOLVER (the "no guessing" guarantee)
     Solves with the same rules a human uses on the elimination grid —
     no backtracking, no trial-and-error. A puzzle is only shipped if
     this solver finishes it, so a unique-but-guessy clue set (unique
     solution, yet findable only by hypothesis testing) is rejected.

     Rules, in escalating tiers (grade = hardest tier that was needed):
       1  seeding + permutation propagation — a placed ✓ eliminates its
          row/column; a value with one spot left is placed. (This is
          what the in-game auto-eliminate assist does.)
       2  link intersection — once X=Z is confirmed, X and Z must agree
          with every other category; copy each other's eliminations.
       3  ordinal bounds — comparative clues squeeze the possible
          positions of both sides from either end.
       4  triangulation — X can't be Y because no intermediate Z is
          compatible with both. The deep cross-reference scan.
  ═══════════════════════════════════════════ */
  function makeDeductionSession(entities, attrCats) {
    const N = entities.length;
    const cats = [{ name: ANCHOR, values: entities.slice() }, ...attrCats];
    const C = cats.length;
    const catIdx = {}, valIdx = {};
    cats.forEach((c, i) => {
      catIdx[c.name] = i;
      valIdx[c.name] = {};
      c.values.forEach((v, k) => { valIdx[c.name][v] = k; });
    });

    // M[i][j] (i<j): N×N possibility grid; M[i][j][a][b] = "cats[i] value a
    // can belong to the same entity as cats[j] value b".
    const M = [];
    for (let i = 0; i < C; i++) {
      M[i] = [];
      for (let j = 0; j < C; j++) {
        M[i][j] = j > i ? Array.from({ length: N }, () => new Array(N).fill(1)) : null;
      }
    }
    const poss = (i, a, j, b) => (i < j ? M[i][j][a][b] : M[j][i][b][a]);
    function cut(i, a, j, b) {
      if (i > j) { [i, j] = [j, i]; [a, b] = [b, a]; }
      if (!M[i][j][a][b]) return false;
      M[i][j][a][b] = 0;
      return true;
    }

    // ── tier 1a: seed the direct facts of one clue ──
    const comparatives = [];
    function seed(cl) {
      if (cl.type === 'positive') {
        const j = catIdx[cl.cat], b = valIdx[cl.cat][cl.val];
        for (let v = 0; v < N; v++) if (v !== b) cut(0, cl.e, j, v);
        for (let e = 0; e < N; e++) if (e !== cl.e) cut(0, e, j, b);
      } else if (cl.type === 'negative') {
        cut(0, cl.e, catIdx[cl.cat], valIdx[cl.cat][cl.val]);
      } else if (cl.type === 'relational') {
        const i = catIdx[cl.cat1], a = valIdx[cl.cat1][cl.val1];
        const j = catIdx[cl.cat2], b = valIdx[cl.cat2][cl.val2];
        for (let v = 0; v < N; v++) if (v !== b) cut(i, a, j, v);
        for (let v = 0; v < N; v++) if (v !== a) cut(i, v, j, b);
      } else if (cl.type === 'comparative') {
        comparatives.push(cl);
      }
    }

    // ── tier 1b: permutation propagation (one sweep) ──
    function passPropagate() {
      let changed = false;
      for (let i = 0; i < C; i++) for (let j = i + 1; j < C; j++) {
        const m = M[i][j];
        for (let a = 0; a < N; a++) {
          let only = -1, n = 0;
          for (let b = 0; b < N; b++) if (m[a][b]) { only = b; n++; }
          if (n === 1) for (let a2 = 0; a2 < N; a2++) {
            if (a2 !== a && m[a2][only]) { m[a2][only] = 0; changed = true; }
          }
        }
        for (let b = 0; b < N; b++) {
          let only = -1, n = 0;
          for (let a = 0; a < N; a++) if (m[a][b]) { only = a; n++; }
          if (n === 1) for (let b2 = 0; b2 < N; b2++) {
            if (b2 !== b && m[only][b2]) { m[only][b2] = 0; changed = true; }
          }
        }
      }
      return changed;
    }

    // fixed yes-link: row a of (i,j) is a singleton {b} and column b is {a}
    function fixedAt(i, j, a) {
      const m = M[i][j];
      let only = -1, n = 0;
      for (let b = 0; b < N; b++) if (m[a][b]) { only = b; n++; }
      if (n !== 1) return -1;
      for (let a2 = 0; a2 < N; a2++) if (a2 !== a && m[a2][only]) return -1;
      return only;
    }

    // ── tier 2: link intersection across confirmed pairs (one sweep) ──
    function passLinks() {
      let changed = false;
      for (let i = 0; i < C; i++) for (let j = i + 1; j < C; j++) {
        for (let a = 0; a < N; a++) {
          const b = fixedAt(i, j, a);
          if (b < 0) continue;
          for (let k = 0; k < C; k++) {
            if (k === i || k === j) continue;
            for (let c = 0; c < N; c++) {
              const pa = poss(i, a, k, c), pb = poss(j, b, k, c);
              if (pa && !pb) { cut(i, a, k, c); changed = true; }
              else if (pb && !pa) { cut(j, b, k, c); changed = true; }
            }
          }
        }
      }
      return changed;
    }

    // ── tier 3: ordinal bounds from comparative clues (one sweep) ──
    function passOrdinal() {
      let changed = false;
      for (const cl of comparatives) {
        const r = catIdx[cl.refCat], o = catIdx[cl.ordCat];
        const a = valIdx[cl.refCat][cl.refValA], b = valIdx[cl.refCat][cl.refValB];
        let maxB = -1, minA = N;
        for (let k = 0; k < N; k++) {
          if (poss(r, b, o, k)) maxB = Math.max(maxB, k);
          if (poss(r, a, o, k)) minA = Math.min(minA, k);
        }
        for (let k = 0; k < N; k++) {
          if (k >= maxB && poss(r, a, o, k)) { cut(r, a, o, k); changed = true; }
          if (k <= minA && poss(r, b, o, k)) { cut(r, b, o, k); changed = true; }
        }
      }
      return changed;
    }

    // ── tier 4: triangulation / path consistency (one sweep) ──
    function passTriangulate() {
      let changed = false;
      for (let i = 0; i < C; i++) for (let j = i + 1; j < C; j++) {
        for (let k = 0; k < C; k++) {
          if (k === i || k === j) continue;
          for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) {
            if (!M[i][j][a][b]) continue;
            let ok = false;
            for (let c = 0; c < N; c++) {
              if (poss(i, a, k, c) && poss(j, b, k, c)) { ok = true; break; }
            }
            if (!ok) { M[i][j][a][b] = 0; changed = true; }
          }
        }
      }
      return changed;
    }

    // solved iff every anchor×category matrix is a permutation matrix —
    // once each entity's attributes are pinned, the attr×attr pairs are
    // implied, and the game's win condition reads only the anchor rows.
    function anchorSolved() {
      for (let j = 1; j < C; j++) {
        const m = M[0][j];
        for (let a = 0; a < N; a++) {
          let n = 0;
          for (let b = 0; b < N; b++) if (m[a][b]) n++;
          if (n !== 1) return false;
        }
      }
      return true;
    }

    // escalate: cheap rules to fixpoint (and re-check solved) before
    // reaching for expensive ones, so the grade reflects what a solver
    // actually NEEDS, not every rule that could still fire afterwards.
    // Matrices only ever lose possibilities, so a session can be reused
    // incrementally: seed more clues and run() again — this is what makes
    // greedy clue building cheap.
    function run() {
      let grade = 1, done = false;
      while (!done) {
        while (passPropagate()) {}
        if (anchorSolved()) break;
        if (passLinks())       { grade = Math.max(grade, 2); continue; }
        if (passOrdinal())     { grade = Math.max(grade, 3); continue; }
        if (passTriangulate()) { grade = Math.max(grade, 4); continue; }
        done = true;
      }

      if (!anchorSolved()) return { solved: false, grade };

      // read the deduced assignment off the anchor row (entity → value per cat)
      const sol = {};
      attrCats.forEach(cat => {
        const j = catIdx[cat.name];
        sol[cat.name] = entities.map((_, e) => {
          for (let b = 0; b < N; b++) if (poss(0, e, j, b)) return cat.values[b];
        });
      });
      return { solved: true, grade, sol };
    }

    return { seed, run };
  }

  /* One-shot solve: seed every clue into a fresh session and run it. */
  function solveByDeduction(entities, attrCats, clues) {
    const session = makeDeductionSession(entities, attrCats);
    clues.forEach(cl => session.seed(cl));
    return session.run();
  }

  /* Per-palette bounds on the deduction grade of a finished puzzle.
     Lower bound keeps hard/expert from shipping a trivially-direct board;
     upper bound keeps easy/medium free of the deep triangulation scans. */
  const GRADE_BANDS = {
    easy:     { min: 1, max: 2 },
    balanced: { min: 1, max: 3 },
    hard:     { min: 2, max: 4 },
    expert:   { min: 2, max: 4 },
  };

  /* Greedy build to a deduction-solvable clue set, then trim to minimal.
     Acceptance is solveByDeduction — NOT mere uniqueness — so every
     shipped puzzle is finishable without trial-and-error. */
  function buildClues(entities, attrCats, sol, palette) {
    const cand = generateCandidates(entities, attrCats, sol, palette);
    // assemble candidate list in palette preference order, shuffled within type
    let ordered = [];
    PALETTES[palette].forEach(type => { ordered = ordered.concat(shuffle(cand[type])); });

    const solvable = clues => solveByDeduction(entities, attrCats, clues).solved;

    // Greedy phase reuses one incremental session: each added clue only
    // cuts more possibilities, so nothing needs recomputing from scratch.
    const session = makeDeductionSession(entities, attrCats);
    const chosen = [];
    let complete = false;
    for (const cl of ordered) {
      chosen.push(cl);
      session.seed(cl);
      if (session.run().solved) { complete = true; break; }
    }
    if (!complete) return null;

    // trim redundant clues
    for (let i = chosen.length - 1; i >= 0; i--) {
      const without = chosen.slice(0, i).concat(chosen.slice(i + 1));
      if (solvable(without)) chosen.splice(i, 1);
    }

    // Easy: leave a little slack — add back 1–2 direct positives for comfort.
    if (palette === 'easy') {
      const extras = shuffle(cand.positive.filter(p =>
        !chosen.some(c => c.type === 'positive' && c.e === p.e && c.cat === p.cat)));
      for (const ex of extras.slice(0, 2)) chosen.push(ex);
    }

    const band = GRADE_BANDS[palette];
    const grade = solveByDeduction(entities, attrCats, chosen).grade;
    if (grade < band.min || grade > band.max) return null;

    return { clues: shuffle(chosen), grade };
  }

  function pickCategories(level, palette) {
    const N = level.items, C = level.cats;
    const needOrdinal = palette === 'hard' || palette === 'expert';
    let pool = shuffle(CATEGORY_POOL);
    let picked = pool.slice(0, C);
    if (needOrdinal && !picked.some(c => c.ordinal)) {
      const ord = pool.find(c => c.ordinal);
      picked[Math.floor(Math.random() * C)] = ord;
    }
    // materialise each category's values to exactly N (ordinal keeps natural order)
    return picked.map(c => ({
      name: c.name,
      ordinal: !!c.ordinal,
      values: c.ordinal ? c.values.slice(0, N) : shuffle(c.values).slice(0, N),
    }));
  }

  /* Fill a story-pack text template with the ACTUAL cast of this puzzle.
     {cast} → "A, B, C, and D" · {count}/{Count} → "four"/"Four".
     Pack prose must use these instead of hard-coding names/counts, because
     easy/medium play with a 4-person slice of the 5-person cast. */
  const COUNT_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six'];
  function fillStoryTokens(text, entities) {
    if (!text) return '';
    const cast = entities.length > 1
      ? entities.slice(0, -1).join(', ') + (entities.length > 2 ? ',' : '') + ' and ' + entities[entities.length - 1]
      : String(entities[0] || '');
    const count = COUNT_WORDS[entities.length] || String(entities.length);
    return text.replace(/\{cast\}/g, cast)
               .replace(/\{count\}/g, count)
               .replace(/\{Count\}/g, count.charAt(0).toUpperCase() + count.slice(1));
  }

  /* Shuffle `values` and keep N — but guarantee `must` stays in when given,
     so a pack's culprit tell is never sliced out at lower difficulties. */
  function sliceKeeping(values, N, must) {
    const shuffled = shuffle(values);
    if (!must || shuffled.slice(0, N).includes(must)) return shuffled.slice(0, N);
    const rest = shuffled.filter(v => v !== must).slice(0, N - 1);
    return shuffle([must, ...rest]);
  }

  /* Generate a full puzzle for a difficulty key. `pack` is an optional
     story-pack object ({ cast, categories, culprit, … }); when omitted the
     random pools above are used. Story/premise handling stays in the UI
     layer — this returns only the logical puzzle. */
  function generatePuzzle(diffKey, pack) {
    const level = LEVELS[diffKey];
    let palette = level.palette;
    const N = level.items, C = level.cats;

    if (pack) {
      // rotate the cast so a 4-person tier doesn't always bench the same
      // character (display order still follows the pack's cast order)
      const kept = new Set(shuffle(pack.cast.map((_, i) => i)).slice(0, N));
      const entities = pack.cast.filter((_, i) => kept.has(i));
      let packCats = pack.categories.slice(0, C);
      // ensure an ordinal category is present when the palette needs one
      const needOrdinal = palette === 'hard' || palette === 'expert';
      if (needOrdinal && !packCats.some(c => c.ordinal)) {
        const ord = pack.categories.find(c => c.ordinal);
        if (ord) packCats = [...packCats.slice(0, C - 1), ord];
      }
      const tell = pack.culprit || null;
      const attrCats = packCats.map(c => ({
        name: c.name,
        ordinal: !!c.ordinal,
        values: c.ordinal ? c.values.slice(0, N)
                          : sliceKeeping(c.values, N, tell && tell.category === c.name ? tell.value : null),
      }));
      for (let attempt = 0; attempt < 60; attempt++) {
        const { sol, solIndex } = buildSolution(entities, attrCats);
        const built = buildClues(entities, attrCats, sol, palette);
        if (built) {
          const allCats = [{ name: ANCHOR, values: entities }, ...attrCats];
          return { entities, attrCats, allCats, sol, solIndex,
                   clues: built.clues, grade: built.grade, palette };
        }
        if (attempt === 45 && palette === 'expert') palette = 'hard';
      }
      return null;
    }

    for (let attempt = 0; attempt < 60; attempt++) {
      const entities = shuffle(NAME_POOL)[0].slice(0, N);
      const attrCats = pickCategories(level, palette);
      const { sol, solIndex } = buildSolution(entities, attrCats);
      const built = buildClues(entities, attrCats, sol, palette);
      if (built) {
        const allCats = [{ name: ANCHOR, values: entities }, ...attrCats];
        return { entities, attrCats, allCats, sol, solIndex,
                 clues: built.clues, grade: built.grade, palette };
      }
      if (attempt === 45 && palette === 'expert') palette = 'hard';
    }
    return null;
  }

  return {
    ANCHOR, LEVELS, PALETTES, CATEGORY_POOL, NAME_POOL, GRADE_BANDS,
    buildSolution, generateCandidates, clueCats,
    countSolutions, isUnique, solveByDeduction, makeDeductionSession, buildClues,
    pickCategories, sliceKeeping, fillStoryTokens, generatePuzzle,
  };
});
