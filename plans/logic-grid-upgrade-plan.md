# Logic Grid — Upgrade Plan

The work program that came out of `plans/logic-grid-review.md`, split
into **individually testable units**. Each unit states its scope, how it
is verified, and its status. Units 1–6 shipped in this pass (one commit
each, in order — every commit left the game playable and the test suite
green). Units 7+ are the recommended future roadmap, smallest-first.

How to run the tests for any unit:

```bash
node tests/logic-engine.test.js     # engine suite (~2300 checks, no deps)
python3 -m http.server 8000         # then exercise logic.html by hand
```

---

## Shipped

### Unit 1 — Engine extraction + test harness ✅
*Commit: "extract pure engine into js/logic-engine.js + Node tests"*

- Move all generation/solving out of `js/logic.js` into DOM-free
  `js/logic-engine.js` (browser global `LogicEngine`, `module.exports`
  for Node). No behavior change.
- Add `tests/logic-engine.test.js`; exclude `tests/` from GitHub Pages.
- **Verified by:** suite green; headless boot of `logic.html` with cell
  cycling; no dangling references (`grep` for moved symbols).

### Unit 2 — No-guessing guarantee + graded difficulty ✅
*Commit: "guarantee no-guessing puzzles with a graded deduction solver"*

- `solveByDeduction()` with four escalating human-rule tiers; acceptance
  switches from `isUnique` to deduction-solvable; `GRADE_BANDS` per
  palette; incremental solver session for the greedy build; full
  negative candidate pool. Expert generation: median 3.2s → ~16ms.
- **Verified by:** suite asserts every tier's puzzles are
  deduction-solvable, deduced solution == planted solution, grades in
  band, uniqueness (oracle), and an avg-generation-speed guard.

### Unit 3 — State-bug batch in the UI layer ✅
*Commit: "fix state bugs — derived auto-marks, restore, timer, filter"*

- Derived (recomputed) auto-elimination marks; generation-before-reset
  in `startGame`; win overlay on restore + solved-flag persistence;
  reset-after-solve restarts the clock; backdrop-dismissable overlay;
  persisted used-clue strikes; hidden-tab timer pause; hardened `esc()`;
  ✓-aware clue filter with an empty state; `parsePairKey` + visible
  escapes for the key separators.
- **Verified by:** headless behavior script (10 checks: auto-mark
  derivation/retraction, reload persistence, restore overlay, reset
  timer, expert filter) — all passing, zero console errors.

### Unit 4 — Pack story templating + cast rotation ✅
*Commit: "template the cast into story prose, rotate the cast"*

- `{cast}`/`{count}`/`{Count}` placeholders in pack prose, filled with
  the actual entities (easy/medium play 4 of the 5-person cast); rotate
  which cast member sits out; data-contract tests forbid literal cast
  names in premises/questions.
- **Verified by:** `fillStoryTokens` unit tests; no-literal-names and
  no-leftover-placeholder checks; rotation observed across 20 games;
  browser check of premise/question at easy.

### Unit 5 — Mobile UX overhaul ✅
*Commit: "mobile UX overhaul — pinned board, sticky headers, touch cells"*

- Board above clues + pinned (`position: sticky`) on phones; sticky row
  headers/category rail during horizontal pan (required
  `border-collapse: separate` border rework); 24px touch cell floor;
  pan-edge fade + preserved pan position; status line under its
  buttons; header fits one line; clue-list height cap removed; bigger
  touch targets.
- **Verified by:** headless geometry checks at 390×844 (region top 0
  under scroll; row-header x stable at 0/21px while panned; 24px cells;
  can-pan flag) + screenshots of easy/expert/triangular/desktop.

### Unit 6 — Documentation ✅

- `plans/logic-grid-review.md` (findings, measurements, decisions) and
  this plan.

---

## Roadmap (not yet built — in recommended order)

Each unit below is deliberately small, independently shippable, and
carries its own acceptance test. None require a build system.

### Unit 7 — Undo
The mark store makes this trivial: push `{key, prev, next}` per user
action onto an in-memory stack (auto marks are derived, so they replay
free); an ↺ Undo button in the top bar pops it. Persist the stack in the
snapshot if cheap, else accept undo-clears-on-reload.
**Test:** place ✓/✗/hint sequences, undo each, assert store equals the
pre-action state (headless script); reset/new-game clears the stack.

### Unit 8 — Mark-mode toggle (✗-first input)
✗ is by far the most common mark but costs two taps. Add a small
✓/✗ segmented toggle above the board (persisted in `cfg.markMode`):
in ✗ mode a tap cycles blank→✗→blank, ✓ via the ✓ mode. Default stays
the current cycle so nobody's muscle memory breaks.
**Test:** behavior script tapping in both modes; cfg persistence.

### Unit 9 — Clue text variety
Per-category phrasing templates ("The Tea drinker…", "Whoever rides the
Griffin…") instead of the uniform "Whoever has X also has Y";
comparative clues should rotate their reference category instead of
always using the first non-ordinal one; ordinal wording per category
("earlier decade", "lower floor", "finished ahead of").
**Test:** template expansion units (no placeholders, correct values);
generation still passes the whole suite.

### Unit 10 — Deeper contradiction scan (opt-in assist)
`scanContradictions` only flags two ✓ in a line. Add: a row with every
value ✗-ed, and ✓-chains that conflict through a third category (reuse
`LogicEngine.makeDeductionSession` — seed the player's ✓/✗ as facts and
report the contradiction cell). Keep it behind the existing Scan button.
**Test:** engine-level unit with hand-built contradictory mark sets.

### Unit 11 — Transitive auto-elimination (triangular layout parity)
In the triangular layout, ✓ marks don't propagate across the
attr×attr matrices (A=B and B=C doesn't auto-fill A=C). Compute the
derived closure with the tier-1/2 rules of the deduction session,
capped so it never derives beyond what the player has established.
**Test:** engine unit: given ✓ set, closure equals expected matrix.

### Unit 12 — Promote the browser behavior script into the repo
The Playwright scripts used in this pass live outside the repo to keep
it toolchain-free. If a dev dependency is acceptable, add
`tests/browser/` + a README note (`npx playwright test` style, optional).
**Test:** the script is the test.

### Unit 13 — Seeded RNG + daily puzzle
Thread a seeded PRNG (mulberry32) through the engine's `shuffle`/random
calls; a puzzle is then reproducible from `(seed, difficulty, packId)`.
Enables shareable puzzle codes and a "Daily" mode keyed on the date;
shrinks the restore snapshot to a seed.
**Test:** same seed ⇒ identical puzzle (deep-equal), different seeds ⇒
different puzzles; suite still green.

### Unit 14 — More story packs / themes
The pack contract is now enforced by tests (section 3 of the suite), so
new packs are data-only PRs: 5 cast + sketches, ≥5 categories (ordinal
last, tell in the first three), templated premises, verdict.
**Test:** the existing pack-contract + pack-generation suite picks up
new packs automatically.

### Unit 15 — Accessibility pass
Cells are `<td>` with click handlers: add `role="gridcell"`,
`aria-label` ("Petra × Chef: empty/yes/no"), `tabindex` roving focus +
arrow-key navigation and space-to-cycle; `#settingsBtn` should be a
`<button>`. Coordinate with the suite's conventions (other games share
the div-button pattern) — possibly a suite-wide pass rather than
logic-only.
**Test:** headless: tab/arrow/space drive a full solve; axe-core run.

---

## Invariants to protect (regression tripwires)

1. **Every shipped puzzle is deduction-solvable** — never reintroduce a
   uniqueness-only acceptance path. Guarded by suite §1b.
2. **The engine stays DOM-free** — `js/logic-engine.js` must keep
   running under plain Node. Guarded by the suite existing at all.
3. **Marks are layout-independent; auto marks are derived** — any new
   assist must read/write through `pairKey` and survive
   `recomputeAutoMarks()`.
4. **Pack prose never hard-codes cast names/counts** — guarded by
   suite §3.
5. **Generation budget**: avg per-puzzle generation stays under the
   suite's 150ms guard (it's ~16ms today; the guard leaves headroom for
   slower CI, not for regressions).
