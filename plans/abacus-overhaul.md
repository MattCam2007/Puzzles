# Abacus — overhaul plan (v1 → v2)

Status: **plan only, not implemented.** Written to be executed step-by-step by an
implementing model with no prior context on this codebase.

Four goals, in priority order:

1. **Fit the screen.** The abacus is a fixed 610×242 px block at every screen size.
2. **Kinetic beads.** Keep tap-to-set, *add* finger-sliding with real physical feel —
   shove, sweep, snap.
3. **Appearance is a choice.** Bead shape, bead material and board finish become
   independent user-selectable sets, not values baked into the abacus style.
4. **Auto-advance by default.** No Check button in the normal flow.

Plus: fix the bugs catalogued in §0.2, which were confirmed by running the build.

---

## 0. Evidence — what is actually wrong

### 0.1 Layout (measured, real viewports, Playwright)

| Viewport | Abacus size | % of screen | Problem |
|---|---|---|---|
| Phone portrait 390×844 | 610×242 | 44.8% | **overflows 126 px** — the ones rod is off-screen; requires sideways scroll |
| Phone landscape 844×390 | 610×242 | 44.8% | **page scrolls 153 px** — earth beads fall below the fold, abacus never fully visible |
| Tablet 1024×768 | 610×242 | 18.8% | huge dead margins |
| Desktop 1180×620 | 610×242 | 20.2% | huge dead margins |

Root cause: every dimension in `STYLES` (`js/abacus.js`) is a hard-coded pixel
constant (`bw: 52, bh: 26, rodW: 62, beamH: 16`), and no code path ever reads the
viewport. The board renders identically on a 4K monitor and a 390 px phone.
`overflow-x: auto` on `.board-wrap` was a workaround; fitting is the fix.

### 0.2 Defects

**Confirmed by execution** — each was reproduced against the live build:

| # | Where | Defect | Evidence |
|---|---|---|---|
| **D1** | `checkAnswer()` | The 800 ms `setTimeout` that advances after a correct answer is **never cancelled**. Answer correctly, then hit New Game inside that window: the orphan timer fires `nextQuestion()` and silently replaces the question you were just given. | Reproduced: New Game showed `6 + 7 =`, one second later it had become `14 − 9 =` with no user action. |
| **D2** | `bestKey()` | Returns `trial-${difficulty}-${trialSecs}` — ignores chain length **and** the operation mix. A 2-number addition best and a 6-number division best fight over one slot, so "Best" is not a comparable number. | All three configs produced the identical key `trial-easy-60`. |
| **D3** | style pickers | Switching abacus style silently wipes the in-progress board. No warning, no undo. | Board reading 8, clicked Schoty, board reads 0. |
| **D4** | `.bead` elements | Plain `<div>`s: `tabindex` null, `role` null, no `aria-label`, `tabIndex < 0`. Not focusable, not announced, invisible to assistive tech and to keyboard users. | Probed directly. |

**Found by code review** (not independently reproducible, but real):

| # | Where | Defect | Severity |
|---|---|---|---|
| D5 | `genQuestion()` div branch | `nums` is only assigned inside `if (start <= cap)`. If all 40 attempts fail, `nums` stays `[]` and the question renders as the bare string `" ="`. | Latent |
| D6 | `genQuestion()` mul branch | Same loop shape: on exhaustion it keeps the last over-cap `answer`, producing a question that cannot be represented on the board. **Correction to the previous draft of this plan:** I claimed this was reachable. It is not — a 6,000-sample sweep over every difficulty × chain length × operation puts the maximum answer at **570,240**, well inside the smallest (7-rod) board's 9,999,999 capacity. Still worth a defensive fallback, but it is latent-only. | Latent |
| D7 | `saveGameState()` | Called on every bead move, using `pushHistory(..., limit 20)` — a read-parse-push-stringify-write of a 20-entry ring buffer per tap, when only `h[h.length-1]` is ever read. | Perf |
| D8 | `genQuestion()` | Calls `Math.random()` directly, so question generation cannot be tested deterministically. This is why v1 ships with no engine test suite. | Testability |
| D9 | `attempts` | Incremented, persisted and restored; never displayed or used. Dead state. | Cruft |
| D10 | whole file | No keyboard input. Every other game in the suite has it (`shouldIgnoreGameKeys` exists in `common.js` for exactly this purpose). | Gap |
| D11 | `nextQuestion()` | With `autoClear` off in auto-advance mode, the board still holds the previous answer when the next question appears. If the new answer equals what is already shown, the user must move a bead away and back to trigger the check. | UX |
| D12 | timers | `setInterval(…, 1000)` for a *timed* mode. Measured drift at idle was 0%, so this is **not** currently a bug — but interval timers are throttled in background tabs, so a backgrounded trial will under-count. Switch to timestamp-derived time when convenient. | Low |

---

## 1. Target outcomes (acceptance criteria)

Every one must be an **automated assertion**, not a judgement call.

**Layout**
- A1. At 844×390 (phone landscape): `scrollHeight <= innerHeight + 1` — zero page scroll.
- A2. At 844×390: abacus bounding box ≥ **55%** of viewport area.
- A3. At 390×844 (phone portrait): `boardWrap.scrollWidth <= boardWrap.clientWidth` — zero horizontal scroll, all rods visible.
- A4. At 390×844: abacus ≥ **40%** of viewport area.
- A5. At 1280×800: abacus ≥ **55%** of viewport area.
- A6. Every abacus style satisfies A1–A5.
- A7. Smallest interactive bead dimension ≥ **28 px** at 844×390.

**Kinetics**
- A8. A pointer drag along a rod moves beads continuously; beads track the finger
      *during* the gesture, not only on release.
- A9. **Tap still works** — a zero-distance press toggles a bead with the existing
      prefix semantics. This is a preserved feature, not a fallback.
- A10. Dragging a bead into its neighbours **shoves them** — the contiguous run moves
      together, as on a real abacus.
- A11. A fast flick sweeps the whole group to the end of its track.
- A12. On release beads snap to rest positions; no bead is ever left between slots.

**Appearance**
- A13. Bead shape, bead material and board finish are **three independent settings**;
      any combination renders without visual breakage.
- A14. Each abacus style has a traditional default (`auto`), which the user can override.
- A15. All combinations persist across reload and work under all four app themes plus
      custom themes.

**Flow**
- A16. In the default mode no `#checkBtn` is visible, and a correct value auto-advances.
- A17. An existing v1 `abacus-cfg` migrates without the user seeing a Check button.

**Engine / correctness**
- A18. `node tests/abacus-engine.test.js` passes with a seeded RNG.
- A19. Generated questions are always representable on the current board, asserted
      across every difficulty × chain length × style (fixes D5/D6).
- A20. Regression tests exist for **D1, D2, D3** specifically.

---

## 2. Architecture decisions (already made — do not re-litigate)

**AD1 — Extract a pure engine.** Create `js/abacus-engine.js`, DOM-free, using the
exact UMD wrapper from `js/logic-engine.js`:

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

Load order in `abacus.html`: `common.js` → `theme.js` → `abacus-engine.js` → `abacus.js`.

**AD2 — Geometry in abstract units.** One unit `U` = one bead height. All geometry is
expressed in `U`; a single JS-computed CSS variable `--u: Npx` scales the whole board.
CSS uses `calc(var(--u) * n)` throughout.

**AD3 — Injected RNG.** `genQuestion(cfg, rng)` where `rng` is a `() => [0,1)`
function. Production passes `Math.random`; tests pass a seeded generator.

**AD4 — Pointer Events.** `pointerdown` / `pointermove` / `pointerup` with
`setPointerCapture`, bound to the **rod/row element** rather than individual beads, so
a gesture that leaves the bead still tracks. One code path for mouse, touch and stylus.

**AD5 — Four independent appearance axes.** This is the key change from the previous
draft. Bead shape was hard-coded per abacus style; it becomes a user choice.

| cfg key | Controls | Note |
|---|---|---|
| `cfg.style` | **Mechanics** — soroban / suanpan / schoty / roman | Determines rod count, bead counts, arithmetic, guide text. *Not* an appearance setting. |
| `cfg.beadShape` | Bead silhouette | `auto` + 8 explicit shapes |
| `cfg.beadMaterial` | Bead colour/finish ramp | 8 materials |
| `cfg.frame` | Board frame + back panel | 8 finishes |

Shape × material is **orthogonal**: 8 shapes + 8 materials = 16 CSS blocks yielding 64
bead looks, not 64 hand-authored sets. Never write a `[shape][material]` combined rule.

```
shapes:    auto | biconical | soft-biconical | oblate | sphere | barrel | lentil | faceted | pebble
materials: themed | dark-wood | light-wood | ivory | jade | brass | obsidian | amber
frames:    theme | wood | dark | brass | walnut | bamboo | rosewood | slate
```

`auto` maps to each style's traditional shape — soroban → `biconical`,
suanpan → `oblate`, schoty → `sphere`, roman → `pebble` — so defaults stay authentic
while anyone who dislikes the sharp diamond can pick `soft-biconical` or `oblate` and
have it apply everywhere.

**AD6 — Kinetic model.** A drag is not "recompute a count." Beads hold **free
positions** while the finger is down and only quantise on release:

- The dragged bead follows the pointer 1:1, clamped to the track.
- Beads between the dragged bead and the wall it is moving toward are **shoved** —
  each pushed to `draggedPos ± k × beadSize`.
- Beads behind it do not move (you cannot pull beads on a real abacus).
- On release: snap to nearest rest slot with a short overshoot easing (~120 ms).
- A release above a velocity threshold **flings** the group to the end of the track.

**AD7 — Collapse modes.** `freestyle` | `practice` (auto-advance, **default**) |
`trial`. The old `flow` mode becomes the practice behaviour. A `requireCheck` setting
(default `false`) brings the Check button back for anyone who wants it.

**AD8 — No new dependencies, no build step.** Plain Node tests + the existing
Playwright smoke suite. Do **not** add `package.json`.

---

## 3. TDD working rules for the implementing model

Follow these literally.

1. **Red first.** Write the test. Run it. *Record the failure.* A test that has never
   failed proves nothing.
2. **Green minimally.** Only enough code to pass. No speculative extras.
3. **Verify before moving on.** Each phase ends with a `VERIFY` block: run that exact
   command, confirm that exact output.
4. **One phase per commit**, message `Abacus: <phase title>`.
5. **Regression run every phase.** `node tests/smoke.test.js` must stay at **0 failed**.
   If a pre-existing assertion breaks, fix the code — never weaken the assertion.
6. If an acceptance criterion cannot be met, **stop and report**. Do not lower a
   threshold to make it pass.
7. Every bug in §0.2 that you fix gets a **regression test written first**, which fails
   for the documented reason before the fix lands.

Test file: `tests/abacus-engine.test.js`, reusing the micro-runner
(`check(name, cond, detail)` / `section(title)`) from `tests/logic-engine.test.js`
lines 20–32.

---

## Phase 1 — Engine extraction, deterministic questions, confirmed bug fixes

Fixes D1, D2, D5, D6, D7, D8, D9. **Nothing visual changes.**

### RED

Create `tests/abacus-engine.test.js` with a seeded RNG:

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

Tests against an API that does not exist yet:

- `abacusValue(state, style)` — `{h:1,e:2}` in the ones place reads 7.
- `freshState(style)` — correct shape per style, all zeros.
- `setValue(n, style)` — round-trips for `[0,1,9,10,99,5,50,12345,maxBoardValue(style)]`, every style.
- `maxBoardValue(style)` — `10^rods - 1`.
- `toggleBead(state, style, rod, group, i)` — prefix semantics: count `> i` sets `i`, else `i + 1`.
- `genQuestion(cfg, rng)` determinism — same seed + cfg ⇒ identical question.
- `genQuestion` integrity, over 4 difficulties × chain 2–6 × 4 styles × 200 seeds:
  - `text` non-empty, never an operand-less `" ="` *(D5)*
  - `0 <= answer <= maxBoardValue(style)` *(D6)*
  - operand count `=== cfg.chainLen`
  - division: re-evaluating left-to-right yields `answer` with zero remainder at every step
  - subtraction: `answer >= 0`
  - only enabled operations appear
- `genQuestion` fallback — with a synthetic `rods: 1` style at `expert`, still returns
  a solvable in-range question.
- **`bestKey(cfg)` regression for D2** — keys must differ when `chainLen` differs and
  when the op mix differs:
  ```js
  check('D2: best key separates chain length',
    bestKey({...base, chainLen:2}) !== bestKey({...base, chainLen:6}));
  check('D2: best key separates op mix',
    bestKey({...base, ops:{add:true}}) !== bestKey({...base, ops:{div:true}}));
  ```

VERIFY (must FAIL):
```
node tests/abacus-engine.test.js
# expect: "Cannot find module '../js/abacus-engine.js'"
```

### GREEN

Create `js/abacus-engine.js` (UMD per AD1). Move from `js/abacus.js`: `STYLES`,
`LEVELS`, `PLACE_NAMES`, `placeLabel`, `freshState`, `abacusValue`, `maxBoardValue`,
`genQuestion`, `bestKey`. Add `setValue`, `toggleBead`.

- `genQuestion(cfg)` → `genQuestion(cfg, rng)`; every `Math.random()` becomes `rng()`.
- **D5/D6:** after each attempt loop, if `!nums.length || answer > cap`, fall back to a
  trivially in-range chain (e.g. all operands 2). Exact shape is your choice — the
  Phase-1 tests are the contract.
- **D2:** `bestKey(cfg)` becomes
  `trial-${difficulty}-${trialSecs}-c${chainLen}-${enabledOpsSorted.join('')}`.
  Old keys are simply orphaned; do not migrate scores (they were not comparable).

In `js/abacus.js`, delete the moved code, use `const E = AbacusEngine;`, and:

- **D1:** store the advance timer in a module-level `advanceTimer`, clear it in
  `startGame()` and `nextQuestion()`:
  ```js
  function clearAdvance() { if (advanceTimer) { clearTimeout(advanceTimer); advanceTimer = null; } }
  ```
- **D7:** replace `pushHistory` with `saveJSON('abacus-history', [snapshot])` — keep it
  an array of one so the existing `history key non-empty` smoke assertion still passes.
- **D9:** delete `attempts` entirely.

**D1 also needs a smoke regression** (it is a UI-layer bug):
```js
// answer correctly, immediately New Game, wait past the old 800ms window
const q1 = await page.evaluate(() => question.text);
await page.waitForTimeout(1000);
const q2 = await page.evaluate(() => question.text);
report('abacus: D1 new game survives pending advance', q1 === q2, `${q1} -> ${q2}`);
```

VERIFY:
```
node tests/abacus-engine.test.js     # expect: "N passed, 0 failed"
node tests/smoke.test.js abacus      # expect: 0 failed
node tests/smoke.test.js             # expect: 0 failed
```

---

## Phase 2 — Responsive scaling

Delivers A1–A7. **Highest-value phase — do not reorder it.**

### RED — engine tests

- `styleUnits(style)` → `{ w, h }` in units. Assert height grows with `heaven + earth`
  and width grows with `rods`.
- `computeUnit(availW, availH, style, opts)` → px per unit:
  - fits: `computeUnit(w,h,s) * styleUnits(s).w <= w + 0.01`, same for height
  - monotonic: a larger box never yields a smaller unit
  - clamped to `[opts.min, opts.max]`
  - a wide-short box is height-bound; a tall-narrow box is width-bound
  - maximises: for any box at least one axis is within 1% of exact fit

VERIFY (must FAIL): `node tests/abacus-engine.test.js`

### GREEN — engine

Convert `STYLES` from pixels to units. Suggested (tests are the contract):

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

```js
function computeUnit(availW, availH, style, { min = 9, max = 46 } = {}) {
  const u = styleUnits(style);
  return clamp(Math.min(availW / u.w, availH / u.h), min, max);
}
```

### GREEN — layout

`css/abacus.css`:
- Every bead/rod/beam px value → `calc(var(--u) * n)`.
- ```css
  body { height: 100dvh; overflow: hidden; }
  .board-wrap { flex: 1 1 auto; min-height: 0; display: grid; place-items: center;
                overflow: hidden; }
  ```
- Remove `overflow-x: auto` and `max-width: 980px` from `.board-wrap`.

`js/abacus.js`:
```js
function fitAbacus() {
  const box = $('.board-wrap').getBoundingClientRect();
  const u = E.computeUnit(box.width, box.height, E.STYLES[cfg.style], { min: 9, max: 46 });
  $('#board').style.setProperty('--u', u + 'px');
}
```
Call from `buildAbacus()` and on `resize` / `orientationchange`, debounced via
`requestAnimationFrame`. Prefer a `ResizeObserver` on `.board-wrap` — it also catches
the settings sheet opening.

**Chrome compaction** (required for A1/A2 — chrome currently eats 340 of 390 px):
- `@media (max-height: 480px)`: `.title` ~1.2 rem, header padding 4 px, collapse
  `.score-box` labels, single-line `.question-bar`, smaller `.action-row`. Target total
  chrome ≤ **110 px**.
- `@media (max-width: 560px)`: move mode / difficulty / op controls out of the top bar
  into the settings sheet (add the missing rows there). Keep only New Game, Guide, Clear.
- Question bar and readout must never wrap to a second line on phone.

VERIFY — add an `abacus-layout` smoke suite looping
`[[844,390],[390,844],[1280,800]] × [soroban,suanpan,schoty,roman]`:
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
node tests/smoke.test.js abacus      # expect: 0 failed, A1–A7 pass
node tests/smoke.test.js             # expect: 0 failed
```

---

## Phase 3 — Kinetic beads (keep the click, add the slide)

Delivers A8–A12. **Tap is a preserved feature — do not regress it.**

The goal is not "drag support," it is *feel*: beads that have weight, shove each
other, and can be swept with a flick.

### RED — engine tests (all pure functions)

- `beadsFromTrack(t, groupSize, beadSize)` — quantiser:
  - `t = 0` → `0`; `0.4×` → `0`; `0.6×` → `1`; `2.5×` → `3`; `99×` → `groupSize`; `t < 0` → `0`
- `shovePositions(state, group, dragIndex, dragPos, beadSize)` → array of **free**
  (unquantised) positions during a drag:
  - the dragged bead sits exactly at `dragPos` (clamped to the track)
  - beads between it and the target wall are pushed to `dragPos ± k × beadSize`
  - beads behind the dragged bead **do not move** (you cannot pull beads)
  - positions are monotonic and never overlap: `|pos[i+1] - pos[i]| >= beadSize`
  - input state object is not mutated
- `flingTarget(velocity, count, groupSize, threshold)`:
  - `|v| < threshold` → `count` unchanged
  - `v` toward the wall above threshold → `groupSize`
  - `v` away from the wall above threshold → `0`
- `snapPositions(freePositions, beadSize)` — every returned position is an exact
  multiple of `beadSize` from the wall (guarantees A12: no bead left between slots).

VERIFY (must FAIL): `node tests/abacus-engine.test.js`

### GREEN — engine

Implement the four functions above.

### GREEN — UI

Replace the per-bead `click` listeners with per-rod pointer handling:

```js
rod.addEventListener('pointerdown', e => {
  rod.setPointerCapture(e.pointerId);
  drag = { rod: r, group: hitTestGroup(e, r), index: hitTestBead(e, r),
           startPos: axisPos(e), lastPos: axisPos(e), lastT: performance.now(),
           velocity: 0, moved: 0 };
  e.preventDefault();
});
rod.addEventListener('pointermove', e => {
  if (!drag) return;
  const p = axisPos(e);
  const now = performance.now();
  drag.velocity = (p - drag.lastPos) / Math.max(1, now - drag.lastT);  // px/ms
  drag.moved = Math.max(drag.moved, Math.abs(p - drag.startPos));
  drag.lastPos = p; drag.lastT = now;
  paintFree(E.shovePositions(rodState[r], drag.group, drag.index, p, unitPx));
});
rod.addEventListener('pointerup', () => { endDrag(); });
rod.addEventListener('pointercancel', () => { endDrag(true); });
```

`endDrag()`:
- If `drag.moved <= 4` px → **treat as a tap**: `E.toggleBead(...)`, existing prefix
  semantics. This is A9.
- Else → `E.flingTarget(...)` if velocity exceeds threshold, otherwise
  `E.beadsFromTrack(...)`; commit the count, re-enable the transition, snap.
- Then, once only: `onBeadMoved()` → `saveGameState()`, `flowCheck()`.

Implementation notes:
- `hitTestGroup` picks heaven vs earth from the pointer's position relative to the
  beam; schoty rows have one group.
- `touch-action: none` on `.rod` / `.srow` so a vertical drag never scrolls the page.
- `.bead.dragging { transition: none; }` for 1:1 tracking; restore the transition on
  release and use an overshoot curve for the snap:
  `transition: top 120ms cubic-bezier(.34,1.56,.64,1)`.
- Update the DOM on every `pointermove`, but call `saveGameState()` / `flowCheck()`
  **only** on release — not per frame.
- Optional polish, both behind settings: `navigator.vibrate(6)` as each bead crosses a
  slot (default **on**), and a synthesized WebAudio click (default **off**, no asset
  files). Wrap motion flourishes in `@media (prefers-reduced-motion: no-preference)`.

### VERIFY

Smoke assertions driving a real pointer sequence:
```js
await page.mouse.move(x, yTop); await page.mouse.down();
await page.mouse.move(x, yTop + 3*unit, { steps: 10 });
const midValue = await page.evaluate(() => abacusValue());   // A8: changes before mouseup
await page.mouse.up();
```
Assert: value changed before `mouse.up()` (A8); three beads moved from one gesture
(A10); a fast two-step drag sweeps the full group (A11); every bead's offset is an
exact multiple of the unit after release (A12); and a plain `click()` still toggles (A9).
```
node tests/abacus-engine.test.js     # expect: 0 failed
node tests/smoke.test.js             # expect: 0 failed
```

---

## Phase 4 — Auto-advance by default

Delivers A16–A17. Fixes D11.

### RED

`migrateCfg(oldCfg)`:
- `{mode:'flow'}` → `{mode:'practice', requireCheck:false}`
- `{mode:'practice'}` (v1, button-based) → `{mode:'practice', requireCheck:false}`
- `{mode:'trial'}` → mode unchanged, `requireCheck:false`
- `{mode:'freestyle'}` → unchanged
- unknown/absent → `practice`
- idempotent: an already-migrated cfg passes through unchanged
- appearance keys absent (v1 cfg) → filled with the AD5 defaults

VERIFY (must FAIL): `node tests/abacus-engine.test.js`

### GREEN

- Implement `migrateCfg`; call it right after `loadJSON('abacus-cfg', {})`, then `saveCfg()`.
- `DEFAULTS`: `mode: 'practice'`, add `requireCheck: false`.
- Delete `flow`. `#modeSelect` → `Freestyle` / `Practice` / `Time Trial`.
- Auto-advance runs in `practice` **and** `trial` whenever `!cfg.requireCheck`.
- Add `#togRequireCheck` → *"Confirm each answer with a Check button instead of
  advancing automatically."*
- `#checkBtn` / `#revealBtn` visibility keys off `cfg.requireCheck`, not off mode.
- **D11:** after `nextQuestion()` with `autoClear` off, set an `armed = false` flag;
  require one bead release before a correct value can count.
- Make the advance feel deliberate: glow the abacus frame green ~350 ms and flash a ✓
  near the readout, then advance.

VERIFY:
```
node tests/abacus-engine.test.js     # expect: 0 failed
node tests/smoke.test.js abacus      # #checkBtn hidden by default; correct value
                                     # auto-advances with no click; seeded v1 cfg
                                     # shows no Check button (A17)
node tests/smoke.test.js             # expect: 0 failed
```

---

## Phase 5 — Bead sets, board sets, fidelity

Delivers A13–A15. This replaces the old "fidelity" phase: appearance becomes a
**menu**, not a single opinionated look.

### RED

- Engine: `resolveBeadShape(style, beadShape)` — returns the explicit shape,
  mapping `auto` to the style default (soroban→`biconical`, suanpan→`oblate`,
  schoty→`sphere`, roman→`pebble`); an explicit choice always wins over the default.
- Engine: `SHAPES`, `MATERIALS`, `FRAMES` are exported arrays of
  `{ id, label, icon }`, each with unique ids.

VERIFY (must FAIL): `node tests/abacus-engine.test.js`

### GREEN — the three pickers

`abacus.html` — three new settings sections mirroring the existing `pick-row` markup,
with `data-bead-shape-pick`, `data-bead-material-pick`, `data-frame-pick`. Wire them
exactly like the existing style picker (see `js/abacus.js` `$$('[data-abacus-pick]')`).

`js/abacus.js` — apply as data attributes on `#board`:
```js
board.dataset.beadShape    = E.resolveBeadShape(cfg.style, cfg.beadShape);
board.dataset.beadMaterial = cfg.beadMaterial;
board.dataset.frame        = cfg.frame;
```

`css/abacus.css` — **orthogonal only.** Shape rules set geometry, material rules set
colour variables. Never write a combined `[shape][material]` selector.

```css
/* silhouettes */
[data-bead-shape="biconical"]      .bead { clip-path: polygon(50% 0, 88% 38%, 100% 50%, 88% 62%, 50% 100%, 12% 62%, 0 50%, 12% 38%); }
[data-bead-shape="soft-biconical"] .bead { border-radius: 50% / 30%; clip-path: none; }
[data-bead-shape="oblate"]         .bead { border-radius: 50% / 38%; }
[data-bead-shape="sphere"]         .bead { border-radius: 50%; }
[data-bead-shape="barrel"]         .bead { border-radius: 28% / 42%; }
[data-bead-shape="lentil"]         .bead { border-radius: 50% / 22%; }
[data-bead-shape="faceted"]        .bead { clip-path: polygon(50% 0, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%); }
[data-bead-shape="pebble"]         .bead { border-radius: 46% 54% 52% 48% / 48% 46% 54% 52%; }

/* materials — colour ramp only */
[data-bead-material="jade"]     { --bead:#4f9e77; --bead-hi:#9fdcbb; --bead-lo:#25543f; }
[data-bead-material="ivory"]    { --bead:#e8dfc8; --bead-hi:#fffaf0; --bead-lo:#a2977c; }
/* …obsidian, amber, brass, dark-wood, light-wood; themed = current accent tokens */
```

Note the biconical polygon has **flat tips** (8 points), not the 4-point rhombus v1
used — that is what makes it read as a turned wooden bead rather than a diamond.
`soft-biconical` and `oblate` exist specifically as the rounder alternatives.

### GREEN — fidelity (applies to every shape/material)

Four layers per bead instead of one gradient:
1. Body: 3-stop `radial-gradient`, light source consistently top-left across the board.
2. `::before` — specular highlight: small ellipse, `mix-blend-mode: screen`, `opacity: .3`.
3. `::after` — contact shadow where the rod enters, so the rod reads as passing *through*.
4. `filter: drop-shadow(0 calc(var(--u)*.06) calc(var(--u)*.08) rgba(0,0,0,.45))`.

Frame: bevel via nested `inset` box-shadows at `--u` scale; wood grain from 2–3 layered
`repeating-linear-gradient`s at ~87° with low alpha; brass from a multi-stop gradient
with two specular bands; back panel darker than the frame so beads cast onto it.
Rod: 2-stop gradient (dark edge → light centre) so it reads cylindrical.
Beam: inset shadow top and bottom plus a hairline highlight.

Everything in `--u` so it scales with Phase 2.

VERIFY:
```
node tests/abacus-engine.test.js     # expect: 0 failed
node tests/smoke.test.js abacus      # every shape × material renders with nonzero
                                     # bead size; all three pickers persist reload (A15)
node tests/smoke.test.js             # expect: 0 failed
```
Then screenshot a shape × material contact sheet at 1280×800 plus all frames, and
review visually before committing.

---

## Phase 6 — Remaining defects and follow-ups

- **D3 (confirmed):** switching abacus style silently discards the board. Either
  preserve the value across the switch (`setValue(oldValue, newStyle)` when it fits) or
  confirm before clearing. Write the regression test first.
- **D4 (confirmed) + D10:** accessibility and keyboard. Beads become focusable
  (`tabindex="0"`, `role="button"`, `aria-label="hundreds rod, 3 beads set"`), arrow
  keys move a rod cursor, digits `0–9` set a rod directly, `C` clears. Must route
  through `shouldIgnoreGameKeys(e)` from `common.js` — copy the pattern in
  `js/sudoku.js` — and add the `checkKeyboardGuardOnSettings` smoke assertion the
  other games have.
- **D12:** switch trial timing from `setInterval` counting to timestamp-derived
  elapsed time so a backgrounded tab cannot under-count.
- **Portrait hint:** if `computeUnit` bottoms out at `min`, show a dismissible
  "rotate for more room" hint rather than blocking portrait.
- **Schoty quarter-wire:** real boards have a 4-bead wire for quarter-rubles.
  Cosmetic authenticity only.

---

## File map

| File | Phase | Change |
|---|---|---|
| `js/abacus-engine.js` | 1,2,3,4,5 | **new** — pure, DOM-free, UMD, Node-testable |
| `tests/abacus-engine.test.js` | 1,2,3,4,5 | **new** — plain Node, no deps |
| `js/abacus.js` | 1–6 | thins to a UI layer; kinetic pointer input; fit; mode collapse; pickers |
| `css/abacus.css` | 2,5 | unit-based sizing; responsive chrome; shape/material/frame axes; fidelity |
| `abacus.html` | 1,2,4,5 | engine `<script>`; mode options; three appearance pickers |
| `tests/smoke.test.js` | 1,2,3,4,5 | `abacus-layout` suite; D1 regression; drag, auto-advance, picker assertions |
| `CLAUDE.md` | 5 | document the engine split, the `--u` unit system, and the appearance axes |

## Commit sequence

```
Abacus: extract pure engine, seed RNG, fix orphan-timer and best-key bugs
Abacus: scale the board to the viewport, compact chrome on small screens
Abacus: kinetic bead dragging with shove, fling and snap
Abacus: auto-advance by default, collapse modes, migrate saved config
Abacus: selectable bead shapes, materials and board finishes
Abacus: accessibility, keyboard input, remaining defects
```
