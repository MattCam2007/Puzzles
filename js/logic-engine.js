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
          const wrongs = cat.values.filter(v => v !== correct);
          const w = wrongs[Math.floor(Math.random() * wrongs.length)];
          out.negative.push({
            type: 'negative', e, cat: cat.name, val: w,
            text: `${name}'s ${low(cat.name)} is not ${w}.`,
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

  /* Greedy build to a unique clue set, then trim to minimal. */
  function buildClues(entities, attrCats, sol, palette) {
    const cand = generateCandidates(entities, attrCats, sol, palette);
    // assemble candidate list in palette preference order, shuffled within type
    let ordered = [];
    PALETTES[palette].forEach(type => { ordered = ordered.concat(shuffle(cand[type])); });

    const chosen = [];
    for (const cl of ordered) {
      chosen.push(cl);
      if (isUnique(entities, attrCats, chosen)) break;
    }
    if (!isUnique(entities, attrCats, chosen)) return null;

    // trim redundant clues
    for (let i = chosen.length - 1; i >= 0; i--) {
      const without = chosen.slice(0, i).concat(chosen.slice(i + 1));
      if (isUnique(entities, attrCats, without)) chosen.splice(i, 1);
    }

    // Easy: leave a little slack — add back 1–2 direct positives for comfort.
    if (palette === 'easy') {
      const extras = shuffle(cand.positive.filter(p =>
        !chosen.some(c => c.type === 'positive' && c.e === p.e && c.cat === p.cat)));
      for (const ex of extras.slice(0, 2)) chosen.push(ex);
    }
    return shuffle(chosen);
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
      const entities = pack.cast.slice(0, N);
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
        const clues = buildClues(entities, attrCats, sol, palette);
        if (clues) {
          const allCats = [{ name: ANCHOR, values: entities }, ...attrCats];
          return { entities, attrCats, allCats, sol, solIndex, clues, palette };
        }
        if (attempt === 45 && palette === 'expert') palette = 'hard';
      }
      return null;
    }

    for (let attempt = 0; attempt < 60; attempt++) {
      const entities = shuffle(NAME_POOL)[0].slice(0, N);
      const attrCats = pickCategories(level, palette);
      const { sol, solIndex } = buildSolution(entities, attrCats);
      const clues = buildClues(entities, attrCats, sol, palette);
      if (clues) {
        const allCats = [{ name: ANCHOR, values: entities }, ...attrCats];
        return { entities, attrCats, allCats, sol, solIndex, clues, palette };
      }
      if (attempt === 45 && palette === 'expert') palette = 'hard';
    }
    return null;
  }

  return {
    ANCHOR, LEVELS, PALETTES, CATEGORY_POOL, NAME_POOL,
    buildSolution, generateCandidates, clueCats,
    countSolutions, isUnique, buildClues,
    pickCategories, sliceKeeping, generatePuzzle,
  };
});
