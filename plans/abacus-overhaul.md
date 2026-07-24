# Abacus — overhaul plan (v1 → v2)

Status: **plan only, not implemented.** Written to be executed step-by-step by an
implementing model with no prior context on this codebase.

This plan fixes four things the v1 build got wrong:

1. The abacus is a **fixed 610×242 px block** at every screen size. It never scales.
2. Beads only respond to **tap**. You cannot drag them with a finger.
3. The default mode makes you press **Check** after every answer.
4. The beads/frame are flat CSS shapes — **low fidelity**.

---

## 0. Evidence — what is actually wrong

Measured on the current build (`node` + Playwright, real viewports):

| Viewport | Abacus size | % of screen | Problem |
|---|---|---|---|
| Phone portrait 390×844 | 610×242 | 44.8% | **overflows 126 px** — the ones rod is off-screen; requires sideways scroll |
| Phone landscape 844×390 | 610×242 | 44.8% | **page scrolls 153 px** — earth beads fall below the fold, abacus never fully visible |
| Tablet 1024×768 | 610×242 | 18.8% | huge dead margins |
| Desktop 1180×620 | 610×242 | 20.2% | huge dead margins |

Root cause: every dimension in `STYLES` (`js/abacus.js`) is a hard-coded pixel
constant (`bw: 52, bh: 26, rodW: 62, beamH: 16`), and no code path ever reads the
viewport. The board renders identically on a 4K monitor and a 390 px phone.

### Secondary defects found in review

| # | File / line | Defect | Severity |
|---|---|---|---|
| D1 | `js/abacus.js` `genQuestion()` div branch | `nums` is only assigned inside `if (start <= cap)`. If all 40 attempts fail, `nums` stays `[]` and the question renders as the empty string `" ="`. Unreachable with today's `LEVELS`, but latent: any harder tier or smaller `rods` count makes it live. | Latent bug |
| D2 | `js/abacus.js` `genQuestion()` mul branch | Same loop shape: on exhaustion it silently keeps the last over-cap `answer`, producing a question that **cannot be represented on the board**. No guaranteed-solvable fallback. | Latent bug |
| D3 | `js/abacus.js` `saveGameState()` | Called on **every bead move**, and uses `pushHistory(..., limit 20)` — a read-parse-push-stringify-write of a 20-entry ring buffer per tap. Only `h[h.length-1]` is ever read. ~20× the storage and a synchronous localStorage write per interaction. | Perf |
| D4 | `js/abacus.js` | `attempts` is incremented, persisted, and restored, but never displayed or used anywhere. Dead state. | Cruft |
| D5 | `js/abacus.js` | `genQuestion()` calls `Math.random()` directly, so question generation **cannot be unit-tested deterministically**. This is why v1 has no engine test suite. | Testability |
| D6 | `js/abacus.js` | No keyboard input at all. Every other game in the suite supports it (`shouldIgnoreGameKeys` exists in `common.js` for exactly this). | Gap |
| D7 | `js/abacus.js` `nextQuestion()` | With `autoClear` off in auto-advance mode, the board still holds the previous answer when the next question appears. If the new answer equals what is already displayed, the user must move a bead away and back to trigger the check. | UX wart |
| D8 | `css/abacus.css` | Bead fidelity: single `radial-gradient`, `box-shadow: none` on soroban, flat 4 px wire, flat beam rectangle. No specular, no contact shadow, no frame bevel, no grain. | Visual |

---

## 1. Target outcomes (acceptance criteria)

Every one of these must be an **automated assertion**, not a judgement call.

**Layout**
- A1. At 844×390 (phone landscape): `scrollHeight <= innerHeight + 1` — zero page scroll.
- A2. At 844×390: abacus bounding box ≥ **55%** of viewport area.
- A3. At 390×844 (phone portrait): `boardWrap.scrollWidth <= boardWrap.clientWidth` — zero horizontal scroll, all rods visible.
- A4. At 390×844: abacus ≥ **40%** of viewport area.
- A5. At 1280×800: abacus ≥ **55%** of viewport area.
- A6. Every style (soroban / suanpan / schoty / roman) satisfies A1–A5.
- A7. Smallest interactive bead dimension ≥ **28 px** at 844×390.

**Interaction**
- A8. A pointer drag down a rod moves multiple beads in one gesture; the value changes to match the finger's final position.
- A9. A tap (zero-distance drag) still toggles a bead — existing behaviour preserved.
- A10. Beads visually track the finger *during* the drag, not only on release.

**Flow**
- A11. In the default mode, no `#checkBtn` is visible, and a correct value auto-advances.
- A12. An existing saved `abacus-cfg` from v1 migrates without the user seeing a Check button.

**Engine**
- A13. `node tests/abacus-engine.test.js` passes with a seeded RNG — question generation is deterministic and table-testable.
- A14. Generated questions are **always** representable on the current board (fixes D1/D2), asserted over all difficulty × chain-length × style combinations.

---

## 2. Architecture decisions (already made — do not re-litigate)

**AD1 — Extract a pure engine.** Create `js/abacus-engine.js`, DOM-free, following the
exact UMD wrapper used by `js/logic-engine.js`:

```js
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AbacusEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  /* ... */
  return { /* public API */ };
});
```

Load order in `abacus.html` becomes: `common.js` → `theme.js` → `abacus-engine.js` → `abacus.js`.

**AD2 — Geometry in abstract units, not pixels.** One unit `U` = one bead height.
All geometry is expressed in `U`; a single JS-computed CSS variable `--u: Npx` scales
the whole board. CSS uses `calc(var(--u) * n)` throughout.

**AD3 — Injected RNG.** `genQuestion(cfg, rng)` takes `rng` (a `() => [0,1)` function).
Production passes `Math.random`; tests pass a seeded generator. This is what makes
TDD possible at all.

**AD4 — Pointer Events for drag.** Use `pointerdown` / `pointermove` / `pointerup`
with `setPointerCapture`. Listeners go on the **rod/row element**, not on individual
beads, so a drag that leaves the bead still tracks. One code path serves mouse, touch
and stylus. A tap is a zero-distance drag, so A9 falls out for free.

**AD5 — Uniform drag math.** For every group of beads (heaven, earth, schoty row),
define a *track* running from the **active wall** (the beam edge, or the left wall on
schoty) outward. Let `t` = distance from the active wall to the finger, measured along
the track. Then:

```
beadsSweptToWall = clamp(round(t / beadSize), 0, groupSize)
```

This single formula covers all three groups — only the axis and origin differ. It is a
pure function and is the core unit test target.

**AD6 — Collapse modes.** Three modes, not four:
`freestyle` | `practice` (auto-advance, **default**) | `trial`.
The old `flow` mode becomes the practice behaviour. A settings toggle
`requireCheck` (default `false`) brings the Check button back for anyone who wants it.

**AD7 — No new dependencies, no build step.** Plain Node tests + the existing
Playwright smoke suite. Do **not** add `package.json`.

---

## 3. TDD working rules for the implementing model

Follow these literally.

1. **Red first.** Write the test. Run it. *Paste the failure into your notes.* A test
   that has never failed proves nothing.
2. **Green minimally.** Write only enough code to pass. No speculative extras.
3. **Verify before moving on.** Each phase below ends with a `VERIFY` block: run that
   exact command and confirm the exact expected output.
4. **One phase per commit.** Commit message: `Abacus: <phase title>`.
5. **Never skip the regression run.** `node tests/smoke.test.js` must stay at
   **0 failed** after every phase. If a pre-existing assertion breaks, fix the code,
   do not weaken the assertion.
6. If a phase's acceptance criterion cannot be met, **stop and report** — do not
   loosen the threshold to make it pass.

Test file naming follows the repo: `tests/abacus-engine.test.js`, using the same
micro-runner (`check(name, cond, detail)` / `section(title)`) copied from
`tests/logic-engine.test.js` lines 20–32.

---

## Phase 1 — Engine extraction + deterministic questions

Fixes D1, D2, D5. Unblocks every later phase. **Nothing visual changes.**

### RED

Create `tests/abacus-engine.test.js`. Include a seeded RNG helper:

```js
function seededRng(seed) {           // mulberry32 — deterministic, dependency-free
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

Write these tests against an API that does not exist yet:

- `abacusValue(state, style)` — `[{h:1,e:2},...]` on soroban reads 7 in the ones place.
- `freshState(style)` — correct length and shape per style; all zeros.
- `setValue(n, style)` — round-trips: `abacusValue(setValue(n, s), s) === n` for
  `n` in `[0, 1, 9, 10, 99, 5, 50, 12345, maxBoardValue(s)]`, every style.
- `maxBoardValue(style)` — `10^rods - 1`.
- `toggleBead(state, style, rod, group, i)` — prefix semantics: clicking bead `i`
  when `count > i` sets count to `i`; otherwise to `i + 1`.
- `genQuestion(cfg, rng)` **determinism**: same seed + same cfg ⇒ identical question.
- `genQuestion` **integrity**, looped over all 4 difficulties × chain lengths 2–6 ×
  all 4 styles × 200 seeds:
  - `question.text` is non-empty and contains no `" ="` with an empty left side *(catches D1)*
  - `0 <= question.answer <= maxBoardValue(style)` *(catches D2)*
  - operand count equals `cfg.chainLen`
  - division: re-evaluating the printed expression left-to-right yields `answer` with **zero remainder** at every step
  - subtraction: `answer >= 0`
  - only enabled operations appear
- `genQuestion` **fallback**: with an artificially tiny style (`rods: 1`) and
  `difficulty: 'expert'`, it must still return a solvable question rather than an
  empty or over-cap one.

VERIFY (must FAIL):
```
node tests/abacus-engine.test.js
# expect: "Cannot find module '../js/abacus-engine.js'"
```

### GREEN

Create `js/abacus-engine.js` with the UMD wrapper from AD1. Move from `js/abacus.js`:
`STYLES`, `LEVELS`, `PLACE_NAMES`, `placeLabel`, `freshState`, `abacusValue`,
`maxBoardValue`, `genQuestion`. Add new: `setValue`, `toggleBead`.

Change `genQuestion(cfg)` → `genQuestion(cfg, rng)`; replace every `Math.random()`
with `rng()`. Route `randInt`/`rr` through the injected `rng`.

**Fix D1/D2 with a guaranteed fallback.** Restructure both loops so that on
exhaustion they degrade to something provably representable, e.g.:

```js
// after the attempt loop, if nothing fit the board:
if (!nums.length || answer > cap) {
  // smallest valid chain for this op: all operands = 2 (or 1 for div)
  ...build a trivially in-range chain...
}
```

The exact fallback is your choice — it only has to satisfy the Phase-1 tests.

In `js/abacus.js`, delete the moved code and read from the engine:
`const E = AbacusEngine;` then `E.genQuestion(cfg, Math.random)`, `E.abacusValue(...)`, etc.

Also in this phase: **delete `attempts`** (D4) and replace `pushHistory` with a direct
`saveJSON('abacus-history', [snapshot])` (D3) — keep the key an array of one so the
existing smoke assertion `history key non-empty` still passes.

VERIFY:
```
node tests/abacus-engine.test.js     # expect: "N passed, 0 failed"
node tests/smoke.test.js abacus      # expect: 0 failed
node tests/smoke.test.js             # expect: 0 failed  (full regression)
```

---

## Phase 2 — Responsive scaling (fixes the mobile problem)

Delivers A1–A7. **The highest-value phase — do not reorder it.**

### RED — engine tests

Add to `tests/abacus-engine.test.js`:

- `styleUnits(style)` returns `{ w, h }`, the board's size **in units**. Assert
  soroban `h === (1+1) + 0.62 + (4+1)` ± padding, i.e. that height grows with
  `heaven + earth` and width grows with `rods`.
- `computeUnit(availW, availH, style, opts)` returns px-per-unit. Assert:
  - fits: `computeUnit(w,h,s) * styleUnits(s).w <= w + 0.01` and same for height
  - monotonic: a larger box never yields a smaller unit
  - clamped: never exceeds `opts.max`, never below `opts.min`
  - width-bound vs height-bound: a wide-short box is height-bound; a tall-narrow box is width-bound
  - fills: for any box, **at least one** axis is within 1% of exact fit (i.e. it
    actually maximises, rather than under-filling both axes)

VERIFY (must FAIL): `node tests/abacus-engine.test.js`

### GREEN — engine

Implement `styleUnits` and `computeUnit`. Convert the `STYLES` table from pixels to
units. Suggested shape (tune to taste, tests are the contract):

```js
soroban: { kind:'vertical', rods:9, heaven:1, earth:4,
           beadH:1, beadW:2.0, rodW:2.4, beamH:0.62, padX:0.5, padY:0.4, frame:0.45 },
suanpan: { kind:'vertical', rods:9, heaven:2, earth:5,
           beadH:1, beadW:1.8, rodW:2.2, beamH:0.62, padX:0.5, padY:0.4, frame:0.45 },
roman:   { kind:'vertical', rods:7, heaven:1, earth:4,
           beadH:1, beadW:1.0, rodW:1.8, beamH:0.7,  padX:0.5, padY:0.4, frame:0.5  },
schoty:  { kind:'rows',     rods:7, beads:10,
           beadH:1, beadW:1.25, rowH:1.35, padX:0.6, padY:0.35, frame:0.45 },
```

`computeUnit(availW, availH, style, {min = 9, max = 46})`:
```js
const u = styleUnits(style);
return clamp(Math.min(availW / u.w, availH / u.h), min, max);
```

### GREEN — layout

**`css/abacus.css`:**
- Replace every hard-coded bead/rod/beam px value with `calc(var(--u) * n)`.
- Make the play area own the leftover space:
  ```css
  body { height: 100dvh; overflow: hidden; }        /* no page scroll, ever */
  .board-wrap { flex: 1 1 auto; min-height: 0; display: grid; place-items: center;
                overflow: hidden; }                  /* no scrollbars — we fit instead */
  ```
- Remove `overflow-x: auto` from `.board-wrap`. Scrolling was the workaround; fitting
  is the fix.
- Drop `max-width: 980px` on `.board-wrap` — let it use the full width.

**`js/abacus.js`:** add a `fitAbacus()` that measures and applies:
```js
function fitAbacus() {
  const box = $('.board-wrap').getBoundingClientRect();
  const u = E.computeUnit(box.width, box.height, E.STYLES[cfg.style], { min: 9, max: 46 });
  $('#board').style.setProperty('--u', u + 'px');
}
```
Call it from `buildAbacus()`, and on `resize` + `orientationchange`, debounced with
`requestAnimationFrame`. Use a `ResizeObserver` on `.board-wrap` if available — it
catches the settings sheet opening/closing too.

**Chrome compaction** (needed to hit A1/A2 — the header currently eats 340 of 390 px):
- Under `@media (max-height: 480px)`: shrink `.title` to ~1.2 rem, header padding to
  4 px, collapse `.score-box` labels, reduce `.question-bar` to a single line, and
  shrink `.action-row` buttons. Target total chrome ≤ **110 px**.
- Under `@media (max-width: 560px)`: move the mode/difficulty/ops controls out of the
  top bar and into the settings sheet (they already have equivalents there — add the
  missing mode/difficulty/op rows to `#settingsPanel`). Keep only New Game + Guide +
  Clear in the bar.
- The readout and question bar must never wrap to a second line on phone.

VERIFY — add to `tests/smoke.test.js` a new `abacus-layout` page-suite that loops
`[[844,390],[390,844],[1280,800]] × [soroban,suanpan,schoty,roman]` and asserts A1–A7:
```js
const m = await page.evaluate(() => {
  const ab = document.querySelector('.abacus').getBoundingClientRect();
  const bw = document.querySelector('.board-wrap');
  return { pct: (ab.width*ab.height)/(innerWidth*innerHeight)*100,
           pageScroll: document.documentElement.scrollHeight - innerHeight,
           hScroll: bw.scrollWidth - bw.clientWidth,
           bead: Math.min(...[...document.querySelectorAll('.bead')]
                   .map(b => { const r = b.getBoundingClientRect(); return Math.min(r.width, r.height); })) };
});
```
```
node tests/smoke.test.js abacus      # expect: 0 failed, all A1–A7 assertions pass
node tests/smoke.test.js             # expect: 0 failed
```

---

## Phase 3 — Finger drag

Delivers A8–A10.

### RED

Add to `tests/abacus-engine.test.js`, testing AD5's uniform formula:

- `beadsFromTrack(t, groupSize, beadSize)`:
  - `t = 0` → `0`
  - `t = 0.4 * beadSize` → `0`
  - `t = 0.6 * beadSize` → `1`
  - `t = 2.5 * beadSize` → `3` (rounds up at .5)
  - `t = 99 * beadSize` → `groupSize` (clamped)
  - `t < 0` → `0` (clamped)
- `dragToState(state, style, rod, group, t)` — returns a **new** state (no mutation),
  with only that group's count changed. Assert the input object is untouched.

VERIFY (must FAIL): `node tests/abacus-engine.test.js`

### GREEN

Implement `beadsFromTrack` and `dragToState` in the engine.

In `js/abacus.js`, replace the per-bead `click` listeners with per-rod pointer
handling:

```js
rod.addEventListener('pointerdown', e => {
  rod.setPointerCapture(e.pointerId);
  drag = { rod: r, group: hitTestGroup(e, r), startCount: /* current */ };
  e.preventDefault();
});
rod.addEventListener('pointermove', e => {
  if (!drag) return;
  const t = axisDistanceFromWall(e, drag);          // px along the track
  const n = E.beadsFromTrack(t, groupSize, unitPx);
  if (n !== currentCount) { applyCount(n); renderBeads(); updateReadout(); }
});
rod.addEventListener('pointerup', e => { drag = null; onBeadMoved(); });
rod.addEventListener('pointercancel', () => { drag = null; });
```

Notes for the implementer:
- `hitTestGroup` decides heaven vs earth from the pointer's position relative to the
  beam; on schoty there is only one group per row.
- **Tap = zero-distance drag.** On `pointerup`, if the pointer never moved more than
  ~4 px, fall back to the old `toggleBead` prefix semantics so single taps still feel
  right and A9 holds.
- Set `touch-action: none` on `.rod` / `.srow` so vertical drags don't scroll the page.
- Update the DOM **during** `pointermove` (A10), but only call `saveGameState()` /
  `flowCheck()` on `pointerup` — not on every move frame.
- Add `.bead.dragging { transition: none; }` so beads track the finger with zero lag,
  then re-enable the 0.13 s transition on release for the snap.

### VERIFY

Add a smoke assertion driving a real pointer sequence:
```js
await page.mouse.move(x, yTop); await page.mouse.down();
await page.mouse.move(x, yTop + 3 * unit, { steps: 10 });
await page.mouse.up();
// assert the rod's digit changed by the expected number of beads
```
Assert also that the value changed **before** `mouse.up()` (proves A10).
```
node tests/abacus-engine.test.js     # expect: 0 failed
node tests/smoke.test.js             # expect: 0 failed
```

---

## Phase 4 — Auto-advance by default

Delivers A11–A12.

### RED

Add to `tests/abacus-engine.test.js`:
- `migrateCfg(oldCfg)`:
  - `{mode:'flow'}` → `{mode:'practice', requireCheck:false}`
  - `{mode:'practice'}` (v1, button-based) → `{mode:'practice', requireCheck:false}`
  - `{mode:'trial'}` → unchanged mode, `requireCheck:false`
  - `{mode:'freestyle'}` → unchanged
  - unknown/absent mode → `practice`
  - an already-migrated cfg passes through unchanged (idempotent)

VERIFY (must FAIL): `node tests/abacus-engine.test.js`

### GREEN

- Implement `migrateCfg` in the engine; call it in `js/abacus.js` immediately after
  `loadJSON('abacus-cfg', {})`, then `saveCfg()`.
- `DEFAULTS`: `mode: 'practice'`, add `requireCheck: false`.
- Delete the `flow` mode. `abacus.html` `#modeSelect` becomes three options:
  `Freestyle` / `Practice` / `Time Trial`.
- Auto-advance runs in `practice` **and** `trial` whenever `!cfg.requireCheck`.
- Add a settings toggle `#togRequireCheck` → `cfg.requireCheck`, described as
  *"Confirm each answer with a Check button instead of advancing automatically."*
- `#checkBtn` / `#revealBtn` visibility keys off `cfg.requireCheck`, not off mode.
- **Fix D7**: when `autoClear` is off, after `nextQuestion()` immediately evaluate
  whether the board already reads the new answer, and if so require one bead move
  before it can count (guard with a `armed` flag set on the first `pointerup` after
  a new question).
- Make the auto-advance feel deliberate: on a correct value, glow the **abacus frame**
  green for ~350 ms and flash a ✓ near the readout, then advance. Wrap the animation
  in `@media (prefers-reduced-motion: no-preference)`.

VERIFY:
```
node tests/abacus-engine.test.js     # expect: 0 failed
node tests/smoke.test.js abacus      # assert #checkBtn hidden by default; assert
                                     # a correct value auto-advances with no click
node tests/smoke.test.js             # expect: 0 failed
```
Also seed a v1 cfg into `localStorage` before load and assert no Check button appears (A12).

---

## Phase 5 — Fidelity pass

Purely visual. **No test may change in this phase** — if `node tests/smoke.test.js`
goes from 0 failed to anything else, you broke something.

Work in `css/abacus.css`. Concrete recipe:

**Beads** — four layers instead of one gradient:
1. Body: 3-stop `radial-gradient` off-centre (light source top-left, consistent across
   the whole board).
2. `::before` — specular highlight: small ellipse, `mix-blend-mode: screen`,
   `opacity: .3`, positioned upper-left.
3. `::after` — contact shadow / rod occlusion: a dark soft ellipse where the rod
   enters the bead, so the rod reads as passing *through*.
4. `filter: drop-shadow(0 calc(var(--u)*0.06) calc(var(--u)*0.08) rgba(0,0,0,.45))`
   for a cast shadow on the back panel.

**Silhouettes** — per style, and stop using a plain rhombus for the soroban:
- soroban: biconical with flat tips — a 6-point `clip-path` polygon, not a 4-point diamond.
- suanpan: oblate/rounded, `border-radius: 50% / 38%`.
- schoty: flattened sphere, `border-radius: 46%`.
- roman: small round counter sitting *in* a groove — add an inset groove shadow.

**Frame:**
- Bevel: nested `inset` box-shadows (light top-left, dark bottom-right) at `--u` scale.
- Wood: 2–3 layered `repeating-linear-gradient`s at ~87° with low alpha for grain,
  over the base colour.
- Brass: multi-stop `linear-gradient` with 2 bright specular bands.
- Back panel slightly darker than the frame so beads have something to cast onto.

**Rod / wire:** 2-stop gradient (dark edge → light centre) so it reads cylindrical, not
as a flat bar. **Beam:** inset shadow top and bottom, plus a hairline highlight.

Everything must remain expressed in `--u` so it scales with Phase 2, and all four
frame finishes must still work under all four app themes plus custom themes.

VERIFY:
```
node tests/smoke.test.js             # expect: 0 failed — unchanged
```
Then screenshot all 4 styles × 4 frames at 1280×800 and 844×390 and review them
visually before committing.

---

## Phase 6 — Optional follow-ups (only after 1–5 are green)

- **Keyboard support (D6):** arrow keys move a rod cursor, digits `0–9` set a rod
  directly, `C` clears. Must route through `shouldIgnoreGameKeys(e)` from
  `common.js` — see how `sudoku.js` does it — and add the
  `checkKeyboardGuardOnSettings` smoke assertion the other games have.
- **Portrait handling:** if `computeUnit` returns below the legibility floor
  (`min`), show a dismissible "rotate for more room" hint rather than blocking
  portrait outright.
- **Bead sound / haptics:** `navigator.vibrate(8)` on bead settle, behind a setting,
  default off.
- **Schoty quarter-wire:** real schoty boards have a 4-bead wire for quarter-rubles.
  Currently not modelled — decorative only, cosmetic authenticity.

---

## File map

| File | Phase | Change |
|---|---|---|
| `js/abacus-engine.js` | 1,2,3,4 | **new** — pure, DOM-free, UMD, Node-testable |
| `tests/abacus-engine.test.js` | 1,2,3,4 | **new** — plain Node, no deps |
| `js/abacus.js` | 1–5 | thins to a UI layer; pointer drag; fit; mode collapse |
| `css/abacus.css` | 2,5 | unit-based sizing; responsive chrome; fidelity |
| `abacus.html` | 1,2,4 | engine `<script>`; mode options; new settings rows |
| `tests/smoke.test.js` | 2,3,4 | new `abacus-layout` suite; drag + auto-advance assertions |
| `CLAUDE.md` | 5 | document the engine split and the `--u` unit system |

## Commit sequence

```
Abacus: extract pure engine, seed RNG, fix latent question-generation bugs
Abacus: scale the board to the viewport, compact chrome on small screens
Abacus: drag beads with pointer events
Abacus: auto-advance by default, collapse modes, migrate saved config
Abacus: high-fidelity bead, rod and frame rendering
```
