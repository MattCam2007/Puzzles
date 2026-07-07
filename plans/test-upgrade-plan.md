# Test Upgrade Plan

Goal: get as close to 100% *meaningful* coverage as practical, prioritising the
things that can silently break: puzzle generation correctness, game-rule logic,
persistence round-trips, and settings wiring. Line coverage on DOM glue is a
non-goal; the pragmatic target is **~100% unit coverage on every engine module
plus behavioural browser coverage of every user-visible flow**.

## 1. Where we are

### Existing tests

| Suite | Runs with | Checks | Covers |
|---|---|---|---|
| `tests/logic-engine.test.js` | plain Node | ~2300 | Logic Grid generation validity, uniqueness, no-guessing solver, grade bands, packs contract, story templating, perf budget |
| `tests/smoke.test.js` | Node + Playwright | 72 | Every page boots clean (console/404s), settings open/close, theme apply + persist, one save/reload round-trip per game, keyboard guard, a few game-specific spot checks |

The Logic Grid engine suite is the model: the engine is a pure, DOM-free UMD
module (`js/logic-engine.js`), so it is `require()`-able from Node and tested
exhaustively with randomized trials + hand-built anchors. Nothing else in the
codebase has that shape, which is why nothing else has unit tests.

### Untested code (the gap)

| File | Testable core hiding inside | Blocker |
|---|---|---|
| `js/sudoku.js` | generator/solver (`generateSolved`, `isValid`, `countSolutions`, `makePuzzle`) — already pure functions | file touches DOM at load; can't be required in Node |
| `js/kakuro.js` | the entire `K` IIFE (layout gen, fill, clue derivation, solver, evaluate, hint, candidates, combos) — already pure and even seeded | same file as the UI controller; not exported |
| `js/2048.js` | `computeMove`, `spawnTile`, `hasMoves`, win-milestone logic, tile-mode render maps | reads module-global `grid`; DOM at load |
| `js/minesweeper.js` | `neighbors`, `placeMines`, `floodReveal`, chord logic, `checkWin`, `currentLevel` clamping | functions read module globals (`cols`, `cellState`, …); DOM at load |
| `js/logic.js` | mark cycling, auto-eliminate, contradiction scan, win check, culprit verdict | mixed with rendering; module-global state |
| `js/common.js` | `loadJSON`/`saveJSON`, `pushHistory`, `formatTime`, `shuffle`, `shouldIgnoreGameKeys` | puzzle-switcher IIFE dereferences `document` at load |
| `js/theme.js` | `_hexToRgb`, `_esc`, custom-theme CSS block builder, storage keys | DOM at load |
| `js/theme-builder.js` | hex validation, import/export shape, id/icon generation | DOM at load |

### Behaviours the smoke suite does not yet exercise

- Winning or losing any game end-to-end (except the two "state survives
  reload" game-over re-checks that are injected via `page.evaluate`).
- Sudoku: pencil mode, hints, strike limits, candidate/excluded highlighting,
  clear, number-first vs cell-first placement.
- 2048: undo, keep-going after 2048, best-score persistence, all tile modes.
- Minesweeper: flag → question → blank cycle, chording, long-press, custom
  board sizes, loss banner + exploded-cell highlight, win auto-flagging.
- Kakuro: notes, hint, autocheck errors, the combinations sheet, win clearing
  the save.
- Logic Grid: marking cells, contradictions, hints, clue filter, pack stories.
- Theme builder: everything (only "rows render" is checked today).
- Corrupt/legacy localStorage: every game boots by calling `restore*()` on
  whatever is in storage; a malformed snapshot must not brick a page.

### Review findings that tests should pin down (decide before/while testing)

1. **Kakuro does not enforce a unique solution.** `K.solve(limit=2)` exists but
   `K.generate` never calls it. `evaluate()`/win accept *any* consistent fill,
   so the game is coherent — but the policy should be explicit: either test
   "win accepts any valid fill" as intended behaviour, or add a uniqueness
   pass to `generate` (code work, Phase 3 decision).
2. **Minesweeper first-click relocation bias** (safe-first OFF): a mine under
   the first click is moved to the lowest free index. Deterministic corner
   bias — characterise it or randomise it.
3. **Minesweeper disallows flagging before the first reveal**
   (`toggleFlag`: `if (!firstClickDone) return`). Classic minesweeper allows
   it. Deliberate? Test whichever way is decided.
4. **`_hexToRgb` only supports 6-digit hex** (`#fff` → `0, 0, 0`). Fine today
   (theme-builder validates 6-digit), but pin with a test so a future 3-digit
   input fails loudly in review, not silently in prod.
5. **Sudoku `countSolutions` has no step cap** — expert generation relies on
   it being fast; add a perf guard like the logic-engine suite has.

## 2. Conventions for all new work

- **Zero dependencies, no build step** stays. Unit suites are plain
  `node tests/<name>.test.js` scripts using the same micro-runner pattern as
  `tests/logic-engine.test.js` (exit code 1 on failure). Browser coverage
  extends the Playwright smoke pattern.
- **Engine extraction uses the proven UMD pattern** from `js/logic-engine.js`
  verbatim: pure module, no `document`/`window`/`localStorage`, loaded via an
  extra `<script>` tag before the game script, `module.exports` under Node.
- **Every extraction phase is behaviour-preserving** and lands *with* its unit
  suite in the same commit. The smoke suite is the safety net: it must be
  green before and after, with zero HTML/CSS diffs beyond the added script tag.
- Randomized-generation tests use repeated trials + invariant checks (the
  logic-engine style), not golden snapshots, except where a seed already
  exists (Kakuro).

## 3. Phases

Each phase is a self-contained, individually shippable unit: it leaves the
suite green, and its own new tests prove its own work.

---

### Phase 0 — Test infrastructure & CI

**Code work:** none (product code untouched).

**Test/infra work:**
- `tests/run-all.js`: discovers and runs every `tests/*.test.js` sequentially,
  aggregates exit codes, prints a summary. Smoke suite runnable separately
  (needs a browser) via a `--smoke` flag or its own invocation.
- GitHub Actions workflow (`.github/workflows/tests.yml`): on push/PR, run
  Node unit suites, then install Playwright chromium and run the smoke suite.
- CLAUDE.md: update the test-commands section to `node tests/run-all.js`.

**Exit criteria:** CI runs both existing suites on every push and fails the
build on any failure.

---

### Phase 1 — Unit tests for shared utilities (`common.js`, `theme.js`)

**Code work:** none required. Load both files in Node via
`vm.runInNewContext` with a minimal stub `document`/`localStorage` (the same
trick `logic-engine.test.js` already uses for `logic-packs.js`). If the stubs
get awkward, the fallback is a `typeof document !== 'undefined'` guard around
the two boot IIFEs — a two-line, behaviour-neutral change.

**New tests — `tests/common.test.js`:**
- `loadJSON`: missing key → fallback; corrupt JSON → fallback; round-trip.
- `saveJSON`: swallows quota errors (stub `setItem` that throws).
- `pushHistory`: appends; trims to `limit` keeping the newest; default 20;
  works from empty/corrupt storage.
- `formatTime`: 0 → `0:00`, 59, 60, 61, 599, 600, large values.
- `shuffle`: returns a new array, same multiset, does not mutate input;
  distribution sanity over trials (every permutation of a 3-element array
  seen).
- `shouldIgnoreGameKeys`: true for INPUT/TEXTAREA/SELECT/contentEditable
  targets and when `#settingsPanel` has `.show`; false otherwise.

**New tests — `tests/theme.test.js`:**
- `_hexToRgb`: valid 6-digit; short/invalid/empty → `0, 0, 0` (pins finding #4).
- `_esc`: `&`, `<`, `>` escaped; non-string input coerced.
- `_injectCustomTheme`: generated CSS text contains every token, correct
  `--accent-rgb`/`--accent-dim` derivations, correct `html[data-theme=…]`
  scope (assert against the stub style element's `textContent`).
- `applyTheme`/`loadTheme`/`applyBoardAlpha`/`applyContrast`: correct
  localStorage keys and values written under the `puzzle-*` namespace;
  defaults (`galaxy`, 100%, contrast off) when storage is empty.
- `loadCustomThemes`: corrupt storage → `[]`.

**Exit criteria:** all pure logic in `common.js`/`theme.js` covered; suites
green in CI.

---

### Phase 2 — Extract the Sudoku engine + unit suite

**Code work:** create `js/sudoku-engine.js` (UMD, pattern of
`logic-engine.js`) and move `generateSolved`, `fillBoard`, `findEmpty`,
`isValid`, `countSolutions`, `CLUES`, `makePuzzle` verbatim. Parameterise
`isLegalPlacement(puzzle, playerBoard, row, col, num)` (it currently reads
globals) and move it too. Add the script tag to `sudoku.html` before
`sudoku.js`; `sudoku.js` consumes the exports. No behaviour change.

**New tests — `tests/sudoku-engine.test.js`:**
- `isValid`: row/col/box conflicts, hand-built cases.
- `generateSolved` (× trials): full board, every row/col/box is a
  permutation of 1–9.
- `countSolutions`: hand-built boards with exactly 0, 1, and 2 solutions;
  respects the `limit` cap.
- `makePuzzle` for every difficulty (× trials): puzzle is a subset of its
  solution; clue count ≥ `CLUES[diff]`; `countSolutions(puzzle) === 1`
  (uniqueness is the product guarantee); perf budget per difficulty
  (finding #5).
- `isLegalPlacement`: conflicts sourced from givens vs player entries;
  the placed cell itself is excluded from conflict checks.

**Exit criteria:** smoke suite green (proves the lift didn't change the game);
new suite green; generation invariants + uniqueness pinned.

---

### Phase 3 — Extract the Kakuro engine + unit suite

**Code work:** move the `K` IIFE — already pure and internally seeded — into
`js/kakuro-engine.js` (UMD). Also export the internals needed for testing
(`segments`, `combos`, `comboCount`, `solve`, `evaluate`, `hint`,
`candidates`, `generate` are already returned; additionally expose
`layoutValid` and `deriveClues`). Script-tag change in `kakuro.html`.

**Decision to make (finding #1):** uniqueness policy. Recommended: keep
multi-solution generation (uniqueness enforcement would slow generation and
the win check already accepts any valid fill) and *test that policy
explicitly* so it is a documented contract, not an accident.

**New tests — `tests/kakuro-engine.test.js`:**
- `segments`/`layoutValid`: hand-built boards — run lengths, 2–9 bounds,
  horizontal/vertical extraction.
- `combos`/`comboCount`: known values (`combos(2,3)` = only {1,2};
  `combos(9,45)` = 1; impossible sums = 0); cache correctness.
- `generate` for every level × sizes 5/8/12 (× trials, fixed seeds):
  layout valid; solution digits 1–9 only on white cells; no duplicate digit
  in any run; `deriveClues` sums match the solution; **same seed → identical
  puzzle** (determinism — the biggest payoff of the existing seeded RNG).
- `solve`: on generated puzzles, `count ≥ 1` and the returned solution
  satisfies every clue; on hand-built multi-solution grids, `count === 2`
  with `limit 2`; `fixed` pre-filled entries respected, contradictory fixed
  → count 0.
- `evaluate`: duplicate-in-run flags both cells; completed-wrong-sum flags
  the run; partial-run over-sum flags entries; a full valid fill →
  `complete: true` **even when it differs from the planted solution**
  (pins the uniqueness policy).
- `hint`: fills a correct-by-solver cell; targets the selected cell when
  given; `conflict: true` on contradictory entries; `null` on a full grid.
- `candidates`: consistent with combos/used digits on hand-built runs.
- Perf budget for `generate` at size 12 / hard.

**Exit criteria:** smoke green; deterministic seed test in place; uniqueness
policy documented in the test file header and CLAUDE.md.

---

### Phase 4 — Extract the 2048 move engine + unit suite

**Code work:** create `js/2048-engine.js` with `computeMove(grid, dir)`
(currently reads global `grid` — take it as a parameter; `2048.js` passes the
global), plus `spawnTile`, `mkGrid`, `deepClone`, `hasMoves(grid)`,
`highestTile(grid)` (extracted from `checkWin`), `WIN_MILESTONES`, `VALS`,
and the `TILE_MODES` render table. Script-tag change in `2048.html`.

**New tests — `tests/2048-engine.test.js`:**
- Golden move cases on hand-built grids, all four directions:
  - slide into empty space; no merge;
  - `[2,2,–,–]` → `[4]` at the wall, `gained === 4`;
  - **no double merge**: `[2,2,4,–]` → `[4,4]`, not `[8]`;
  - `[2,2,2,2]` → `[4,4]`; `[4,2,2,–]` → `[4,4]` (merge pair nearest the wall);
  - full line no-op → whole-board no-op returns `null`;
  - `moves[]` metadata: absorbed tile flagged, `mergedVal` set, ids preserved.
- `spawnTile`: only fills empty cells; returns `null` on a full grid;
  2 vs 4 ratio ≈ 90/10 over trials; unique incrementing ids.
- `hasMoves`: full board with no adjacent equals → false; with one
  horizontal or vertical pair → true; any empty cell → true.
- `highestTile` + milestone logic: 2048 then 4096 trigger once each with
  `wonAcked` semantics (pure part).
- Tile modes: every mode renders every value in `VALS` with non-empty text,
  no `undefined`, correct `cls` flags (guards the roman/greek/emoji maps).

**Exit criteria:** smoke green; the merge rules — the heart of the game —
are locked by goldens.

---

### Phase 5 — Extract the Minesweeper engine + unit suite

**Code work:** the largest extraction. `js/minesweeper-engine.js` exporting a
state-object API instead of module globals, e.g.
`createBoard({cols, rows, mines})` returning `{cols, rows, counts, mineSet,
cellState, …}`, with `neighbors(state, i)`, `placeMines(state, safeIdx)`,
`floodReveal(state, i)`, `reveal(state, i)` (returns outcome:
`ok|boom|win`), `chord(state, i)`, `toggleFlag(state, i, questionMarks)`,
`checkWin(state)`, plus pure `clamp`, `currentLevel(cfg)`, `bestKey(cfg,
state)`. `minesweeper.js` keeps its globals but delegates to the engine.
This one is *not* a verbatim lift — the smoke suite plus a temporarily
expanded Phase-7-style browser check for minesweeper should land in the same
commit to guard it.

**New tests — `tests/minesweeper-engine.test.js`:**
- `neighbors`: corner (3), edge (5), interior (8); no wrap-around across
  rows (index i on the right edge must not neighbour i+1).
- `placeMines` (× trials): exactly `mines` mines; never on `safeIdx`;
  `counts` brute-force cross-checked against `mineSet`.
- `floodReveal`: hand-built boards — zero-region opens fully and stops at
  numbers; flagged cells are not revealed; `revealedCount` exact.
- `reveal`: mine → `boom`; number cell reveals one; first-click safe
  (safe-first path never booms across trials); the non-safe-first
  relocation path (characterises finding #2 — or its fix).
- `chord`: under-flagged number highlights/no-ops; correctly-flagged number
  reveals neighbours; wrong flag + chord → `boom`; flags equal but on wrong
  cells → detonation index reported.
- `checkWin`: reveal-all-non-mines wins and auto-flags remaining mines;
  one covered safe cell left → not yet.
- `toggleFlag`: cycle covered → flag → question → covered with
  `questionMarks` on; flag → covered with it off; revealed cells ignored;
  pre-first-click behaviour pinned per the finding #3 decision.
- `currentLevel`: classic levels; custom clamping (5–40 sides,
  1 ≤ mines ≤ cells−1, NaN/garbage cfg values fall back sanely).

**Exit criteria:** engine covered including every loss/win path; smoke +
browser minesweeper checks green.

---

### Phase 6 — Logic Grid UI-state logic + gaps in the existing engine suite

**Code work:** extract the pure grid-state pieces of `js/logic.js` into
`js/logic-state.js` (UMD): `pairKey`/`parsePairKey`, the `cycleCell` state
machine (as a pure `nextMark(current, hasAuto)` + mutation wrapper),
`autoEliminate`/`recomputeAutoMarks`, `scanContradictions`, the win check,
and `culpritVerdict` templating. `logic.html` gains one script tag.

**New tests — `tests/logic-state.test.js`:**
- `pairKey` round-trips through `parsePairKey`; keys with the control-char
  separators never collide for values containing spaces/punctuation.
- Mark cycle: blank → ✓ → ✗ → blank; auto-marks (state 3) are replaced
  correctly when cycled; setting a ✓ auto-eliminates its row and column.
- `recomputeAutoMarks`: removing a ✓ clears exactly its derived ✗s and
  keeps user ✗s.
- `scanContradictions`: two ✓ in one row; ✓ vs ✗ on the same pair via
  links; clean grid → empty set.
- Win check: exact solution grid wins; one wrong pair doesn't; culprit
  verdict fills `{name}` with the right entity.

**Existing-suite work (`tests/logic-engine.test.js`):** small gap-fills —
comparative clue *text* correctness (currently only truth is checked),
`fillStoryTokens` with a single-name cast, `generatePuzzle` with an invalid
difficulty key, `sliceKeeping` when `must` is not in `values`.

**Exit criteria:** every deduction the *player's grid* makes (not just the
generator) is unit-tested.

---

### Phase 7 — Behavioural browser suite (gameplay E2E per game)

**Code work:** none intended; anything found here is a bug fix with its own
regression check.

**Test work:** restructure `tests/smoke.test.js` into `tests/browser/` with
the shared helpers (`startServer`, `runPageSuite`, `checkSettingsAndTheme`,
`checkStateSurvivesReload`, `checkKeyboardGuardOnSettings`) in a helper
module and one file per page, all driven by a single entry point (keeps the
`node tests/smoke.test.js [filter]` UX). Then add the missing flows:

- **Sudoku:** wrong entry ×3 → game over overlay + dots fill; hint fills the
  solution value; pencil mark set/clear + auto-erase on placement; strike
  limit "unlimited" never ends the game; win by completing a nearly-done
  board (fill via `page.evaluate` from `solution`); clear resets entries but
  not givens.
- **2048:** undo restores grid + score and disables itself; keep-going after
  an injected 2048 milestone, banner not re-shown for acked milestone; best
  score persists across reload; hex/roman tile modes render expected labels.
- **Minesweeper:** click flag-mode button then tap → flags; right-click
  cycles flag/question/blank; loss shows banner with exploded cell `.exploded`;
  win (tiny custom board injected via cfg) auto-flags and records best time;
  custom size form clamps out-of-range input.
- **Kakuro:** notes mode pencils digits; hint places a solver-correct digit
  with `.hinted`; autocheck flags a duplicate in-run entry; combo sheet opens
  from a clue tap and lists correct combinations; win clears `kakuro_save_v1`.
- **Logic Grid:** cycle a cell ✓/✗; auto-elimination appears when enabled;
  filling the full solution (via `page.evaluate` from `PUZZLE.sol`) triggers
  the win overlay; hint marks a correct pair; clue filter narrows the list.
- **Theme builder:** editing a token updates the preview swatch; save writes
  a well-formed entry to `puzzle-custom-themes`; the saved theme then appears
  and applies in a game page's settings (cross-page integration); export
  produces valid JSON; import of that JSON round-trips; invalid hex input is
  rejected.
- **Resilience (all games):** seed corrupt/truncated `<game>-history` and
  `<game>-cfg` (wrong types, `null`, `"{"`) before load → page boots clean,
  falls back to a fresh game, console stays error-free.

**Exit criteria:** every user-visible flow listed in §1 exercised headlessly;
suite still runs in a few minutes and stays green in CI.

---

### Phase 8 — Hardening & coverage measurement (stretch)

- **Coverage report:** run unit suites under `node --experimental-test-coverage`
  or `c8` (dev-only, not a runtime dep) in CI; publish the summary in the job
  output. Target: engine modules ≥95% line/branch; treat DOM glue as covered
  by the browser suite, not by line metrics.
- **Seeded RNG injection** for the remaining engines (generalise Kakuro's
  `rng(seed)`), making sudoku/2048/minesweeper generation deterministic in
  tests and enabling golden snapshots where useful.
- **Perf budgets everywhere:** every generator gets the logic-engine-style
  "avg < N ms" guard so a slow regression fails CI instead of freezing the UI
  thread.
- **Follow-ups from decisions:** if Phase 3 chose uniqueness enforcement for
  Kakuro, or Phase 5 chose to allow pre-first-click flags / randomised
  relocation, implement + test here.

## 4. Suggested order & why

Phases 0 → 1 are pure wins with no product risk. Phases 2 → 5 go in
increasing extraction difficulty (sudoku's engine is already pure functions;
kakuro is already an IIFE; 2048 needs one parameter change; minesweeper needs
a state object). Phase 6 closes the last unit gap. Phase 7 is independent of
2–6 and can be interleaved, but doing it after the extractions means engine
bugs surface in fast Node tests rather than slow browser ones. Phase 8 is
optional polish.

Every phase leaves `node tests/run-all.js` and the smoke suite green — there
is no point mid-plan where the repo is less tested than it was before.
