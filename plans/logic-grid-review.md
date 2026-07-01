# Logic Grid — Staff Review (July 2026)

A deep review of the Logic Grid game across three axes: **code
architecture**, **puzzle-generation validity**, and **mobile UX**.
Findings are labelled ✅ *fixed in this pass* or 📋 *deferred* (tracked in
`logic-grid-upgrade-plan.md`). Measurements were taken with the Node test
harness (`tests/logic-engine.test.js`) and headless Chromium at 390×844.

Companion doc: `plans/logic-grid-upgrade-plan.md` (the units of work).
Original design doc: `plans/logic-grid.md`.

---

## 1. Verdict up front

The game's core design is sound: the layout-independent pairwise mark
store is genuinely good architecture (both board layouts render off one
model, so the layout toggle costs nothing), and the greedy build-and-trim
clue generator is the right shape. But the implementation had one design
gap that undermined the product promise — **puzzles were validated for
uniqueness, not for deducibility** — and the phone experience failed
basic ergonomics (18px tap targets, board below the fold, headers
scrolling away mid-pan). Both are fixed; the details follow.

---

## 2. Generation validity (the core finding)

### 2.1 Unique ≠ solvable without guessing — ✅ fixed

The generator accepted a clue set as soon as a backtracking counter
(`countSolutions`) proved exactly one solution exists. That is the wrong
acceptance test for a logic puzzle: a clue set can pin a unique solution
that is only *findable* by hypothesis-and-contradiction search, which is
exactly the "guessing" the game promises to never require.

Measured on the shipping engine (25 trials/tier, human-rules solver as
the referee):

| Tier   | Needed guessing | Generation time (desktop Node)   |
|--------|-----------------|----------------------------------|
| easy   | 0/25            | median 7ms                       |
| medium | 0/25            | median 27ms                      |
| hard   | **2/25**        | median 374ms, max 2.9s           |
| expert | **2/25**        | median 3.2s, **max 122s**        |

~8% of hard/expert boards broke the no-guessing promise, and expert
generation could freeze the UI thread for minutes (phones are 5–10×
slower than the test machine).

**Fix.** Acceptance is now `solveByDeduction()` in `js/logic-engine.js`:
a solver restricted to the elimination rules a human can perform on the
grid, applied in four escalating tiers:

1. **Seeding + permutation propagation** — a ✓ eliminates its row/column;
   a value with one spot left is placed. (What the in-game auto-eliminate
   assist does.)
2. **Link intersection** — once X=Z is confirmed, X and Z copy each
   other's eliminations against every other category.
3. **Ordinal bounds** — comparative clues squeeze both sides' possible
   positions from either end.
4. **Triangulation** (path consistency) — X can't be Y because no
   intermediate Z is compatible with both.

A puzzle ships only if this solver finishes it, which *implies*
uniqueness (the exhaustive `countSolutions` is kept as the test oracle
and the suite asserts the deduced solution equals the planted one).

Two side benefits fell out:

- **Difficulty is now measurable.** The hardest tier the solver needed is
  the puzzle's **grade** (stored as `PUZZLE.grade`). Per-palette
  `GRADE_BANDS` reject easy/medium boards that would need deep
  triangulation and hard/expert boards that solve by direct lookup —
  "challenging" is now enforced, not hoped for.
- **Generation is ~200× faster** (expert median 16ms, max ~20ms) because
  rule propagation replaces exponential backtracking, the greedy phase
  reuses one incremental solver session (eliminations are monotone —
  adding clues never invalidates prior cuts), and the negative-clue pool
  now offers every wrong value instead of one random pick per cell
  (starving the builder used to force whole-board retries).

### 2.2 Related generation notes

- ✅ The trim pass keeps clue sets minimal *with respect to the deduction
  rules*, so easy's two re-added positive anchors remain the only
  deliberate slack.
- ✅ Pack invariants are now tested: the culprit tell's category must sit
  in the first three (survives the easy slice), the tell's value must
  survive `sliceKeeping`, sketches must cover the cast.
- 📋 Comparative clues only ever reference the *first* non-ordinal
  category, and only one negative phrasing exists. Clue-surface variety
  is a content upgrade, not a correctness issue.
- 📋 No seeded RNG: puzzles can't be shared or replayed ("daily puzzle").
  The restore snapshot stores the whole puzzle instead — fine at this
  scale.

---

## 3. Architecture

### 3.1 What was right

- **Pairwise mark store** keyed by `(category,value)`-pair: one model,
  two renderers (`renderEntityGrid` / `renderTriangularGrid`); assists,
  win check and persistence are layout-agnostic. Keep this.
- Suite conventions followed faithfully (shared settings sheet, theme
  tokens, `color-mix` board alpha, localStorage key namespaces,
  restore-on-reload).

### 3.2 What was wrong

- ✅ **Everything lived in one 905-line file** mixing pure engine with
  DOM. Generation/solving now lives in `js/logic-engine.js` — a
  DOM-free module loaded as `LogicEngine` in the browser and
  `require()`-able from Node — which is what makes the 2 300-check test
  suite possible (`node tests/logic-engine.test.js`, zero dependencies,
  no build step).
- ✅ **`pairKey` used literal control characters** (`\0`, `\x01`) as
  separators — *raw bytes in the source file*. They rendered invisibly
  in editors (the key looked like it had no separator at all) and made
  git treat `logic.js` as a binary file, hiding every diff of the game's
  main file. Now written as `\u0000`/`\u0001` escapes with a
  `parsePairKey` inverse. Key format unchanged — saved games survive.
- ✅ **Auto-eliminations were write-once.** Marking a ✓ splashed derived
  `·` marks into the store; un-marking the ✓ left them behind, silently
  poisoning the grid until a full reset (worst with a mis-tap on a 24px
  cell). Auto marks are now *derived state*: wiped and recomputed from
  the current ✓ set after every change. This also let the auto-eliminate
  settings toggle apply/retract retroactively, and gave tapping an auto
  `·` a sane meaning (solidify to user ✗).
- ✅ **`startGame` cleared state before generating**, so a generation
  failure wiped the in-progress game and left a live timer on a dead
  board. Generation now happens first.
- ✅ Assorted lifecycle holes: restored solved games reopened the win
  overlay with an empty message (and `endGame` never persisted the
  solved flag); Reset on a finished board left the clock stopped; the
  overlay could not be dismissed to view the solved grid; clue
  strike-through state wasn't persisted; the timer kept "running" while
  the tab was hidden at the mercy of background throttling.
- 📋 `renderGrid` rebuilds the whole table per tap (~150 cells at
  expert). Fine on 2026 hardware after measurement; an incremental cell
  differ is queued as an optional optimization, not a need.
- 📋 `pushHistory` keeps 2 snapshots but no undo exists; either build
  undo on top of it or flatten to `saveJSON`.

### 3.3 Security / hardening

- ✅ `esc()` only escaped double quotes. All interpolated content is
  static or from localStorage today (no untrusted input reaches the
  DOM), so this was hardening rather than a live vulnerability — but
  `esc()` now escapes `& < > "` and is applied at every dynamic
  interpolation (grid headers, clue text, pills, cast list).
- Note: the background-image URL feature is suite-shared (`theme.js`)
  and out of scope here.

---

## 4. Mobile UX (the "sucks on a phone" axis)

Observed at 390×844 before the changes: the header wrapped to two lines,
the clue panel dominated the viewport with the grid below the fold,
marking from a clue meant scroll-down/scroll-up per deduction, expert
cells hit the 18px floor (≈half a fingertip), panning the wide tiers
scrolled the entity names off-screen, and nothing indicated the board
could pan at all.

Shipped (all in `logic.html`/`css/logic.css`/`updateCellSize`):

- **Pinned board.** The board renders *above* the clue list and sticks to
  the top of the screen on phones (blurred translucent backdrop). The
  clue list scrolls beneath it — clue→grid round-trips are gone. This is
  the single biggest fix.
- **Pinned headers.** Row headers (and the triangular category rail) are
  `position: sticky` during horizontal pan, with deliberately opaque
  backgrounds. The table had to move from `border-collapse: collapse` to
  `separate` + per-cell right/bottom borders — collapsed borders detach
  from sticky cells.
- **Finger-sized cells.** 24px minimum on coarse pointers (mouse keeps
  18px); `touch-action: manipulation`; bigger tap targets on top-bar
  buttons and filter pills.
- **Pan affordance.** A right-edge fade appears while columns hide
  off-screen and clears at the end of the pan; pan position survives
  re-renders.
- Status feedback moved under the buttons that produce it; title no
  longer wraps; the 38vh clue-list cap removed (page scroll + pinned
  board is the natural model now).

Deferred (📋, in the plan): a mark-mode toggle (✗-first input — ✗ is the
most common mark and currently costs two taps), undo, keyboard/ARIA
support, collapsible story panel.

### 4.1 UX behaviors that were broken regardless of screen size

- ✅ The clue **Filter was useless on hard/expert**: it only matched
  positive/negative clues, and those palettes may ship none — pills
  filtered the list to an unexplained void. The filter now also surfaces
  relational/comparative clues that mention any value the player has
  ✓-linked to the entity, and shows an explanatory empty state.
- ✅ **Story packs accused absent suspects.** Premises hard-coded all
  five cast names and the word "five", but easy/medium play with four
  entities. Pack prose now uses `{cast}`/`{count}`/`{Count}` templates
  filled with the actual suspects, the cast slice rotates per game, and
  a data-contract test forbids literal cast names in prose.

---

## 5. What was deliberately left alone

- The **win condition** stays anchor-projection-only (a wrong ✓ in an
  attr×attr cell of the triangular layout doesn't block a win, even with
  "require no wrong marks" on). Matches the entity-rows mental model;
  documented rather than changed.
- The **cycle order** blank→✓→✗ is kept (a mode toggle is the plan item;
  silently reversing the cycle would ambush existing players).
- `maximum-scale=1.0, user-scalable=no` is an accessibility trade-off,
  but it is the suite-wide convention — changing it belongs to a
  suite-level decision, not this game.
- Timer stays second-granular and pauses while hidden; no attempt at
  wall-clock reconciliation.

---

## 6. Test coverage added

`node tests/logic-engine.test.js` — ~2 300 checks, no deps:

1. **Validity** per tier: entity/category counts, bijective solutions,
   distinct values, ordinal order preserved, clue truthfulness, **unique
   solution** (backtracking oracle), clean clue text.
2. **No-guessing**: every generated puzzle solves by deduction rules;
   deduced solution equals planted solution; grade within the tier band;
   generation-speed regression guard (avg <150ms/tier).
3. **Packs**: whodunit contract (tell present at every difficulty),
   sketches cover cast, prose templating contract, cast rotation.
4. **Units**: `sliceKeeping`, `pickCategories` ordinal guarantee,
   `countSolutions` on hand-built cases, `fillStoryTokens` grammar.

Browser behavior was verified headless (Playwright) for: auto-mark
derivation/retraction, persistence of marks + used clues across reload,
win/restore overlay, reset-after-solve timer, expert filter, sticky
board/header geometry at 390×844, both layouts, and zero console errors.
These scripts are not checked in (the suite has no JS toolchain by
design); the plan doc lists promoting them as an optional unit.
