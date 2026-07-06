# Cleanup & unification — execution plan

Master plan for the cleanup/polish pass described in `plans/cleanup-prompt.md`
(the brief). This file is the durable record of the audit, the approved
decisions, the phase breakdown, and the current status. One detailed plan
document per phase lives alongside this file (`cleanup-phase-<n>-*.md`).

## Workflow contract

Two-window flow on branch `claude/puzzles-cleanup-unify-09mq96`:

1. **Planner window** writes the detailed plan for the current phase and
   pushes it.
2. **Implementation window** (separate session, same branch) implements
   exactly that plan and pushes, in small behavior-preserving commits.
3. **Planner window** validates the pushed work (runs the test suites, loads
   the games, reviews the diff against the plan), updates the status table
   below, then writes the next phase plan — or declares the pass done.

Rules for the implementation window:

- Implement only what the current phase plan specifies. If something in the
  plan turns out to be wrong or ambiguous against the real code, stop and
  leave a note in the phase doc rather than improvising.
- Every commit: run `node tests/logic-engine.test.js` and (once it exists)
  `node tests/smoke.test.js`. Both must be green before pushing.
- Never violate the hard constraints below.

## Hard constraints (from the brief — do not violate)

- No build step, no framework, no dependencies, no bundler. The site must
  keep working served as plain static files.
- Behavior-preserving gameplay. Shared UI chrome (buttons, labels,
  placement) may change; game boards, rules, difficulty, and the theme
  system may not. Never remove a feature.
- `node tests/*.test.js` stays green.
- Never orphan a returning player's localStorage — migrate keys, with the
  old key removed only after the new key is written.

## Approved decisions

1. **Difficulty select**: unify on *immediate restart* when the dropdown
   changes (Minesweeper/Logic behavior becomes the standard; Sudoku and
   Kakuro adopt it).
2. **Timers**: unify on *pause while the tab is hidden* (Logic Grid behavior
   becomes the standard; Sudoku, Kakuro, Minesweeper adopt it).
3. **opencode model slugs**: no opencode config is visible in this
   environment; ship models.dev-style defaults with a "verify against your
   configured providers" comment. Defaults: `anthropic/claude-opus-4-8`,
   `anthropic/claude-sonnet-5`, `anthropic/claude-haiku-4-5`,
   `anthropic/claude-fable-5`, `zai/glm-4.6`.

## Audit findings (2026-07-06, all files read; ranked by payoff-to-risk)

### (a) Correctness bugs

- **a1. Keyboard handlers leak into settings inputs.** 2048, Sudoku and
  Minesweeper listen for game keys on `document` with no focus/panel guard.
  2048 `preventDefault`s WASD/arrows so they cannot be typed into the
  background-image URL field (and the board moves under the sheet); Sudoku
  places digits typed into that field onto the board; Minesweeper flags
  cells on `f`. Kakuro already guards (`#settingsPanel.show` check) — give
  all games an equivalent guard plus an input-focus check.
- **a2. Finished games restore to a locked board with no end screen.**
  `restore2048()` unconditionally hides the banner; Sudoku's restore hides
  `#overlay`. Reloading after game-over yields a dead board that silently
  ignores input. Minesweeper and Logic already re-show the end state —
  bring 2048 and Sudoku in line.
- **a3. 2048 Animation Style / Tile Style picks reset on reload.**
  `currentAnim` / `currentTileMode` are never persisted. Persist them in a
  new `2048-cfg` (2048 currently has no cfg key at all).
- **a4. Sudoku lives display caps at 3 dots** while the strike limit can be
  5/10; the indicator stops meaning anything past 3 (and
  `updateMistakeDots` computes an unused `lim`). Render dots from the limit.

### (b) Duplication / DRY

- **b1. ~100 lines of chrome CSS copy-pasted into each of the 5 game
  stylesheets** (`.header`, `.score-box`, `.btn`, `.btn.accent`, `.btn-top`,
  `.difficulty-select` incl. duplicated data-URI arrow, `.board-top-bar`,
  `.overlay`/`.overlay-card`/`.btn-primary`, `.banner`) — with drift: 2048/
  Sudoku/Kakuro hard-code `rgba(124,106,247,0.3)` for the accent active
  state (wrong under non-Galaxy themes); Minesweeper/Logic correctly use
  `var(--accent-rgb)`. → one shared chrome stylesheet; per-game width via a
  `--page-max` custom property.
- **b2. Settings-panel scaffolding + Appearance/Background sections are
  byte-identical in all 5 game HTML files** (~65 lines each). → `theme.js`
  injects the shared sections; HTML keeps only game-specific sections.
- **b3. `onToggle()` defined 4× (identical shape); Sudoku/Kakuro numpad +
  action-row markup/styles near-identical.** → shared helper in
  `common.js`; shared classes in the chrome stylesheet.
- **b4. Kakuro persists every change twice** — `kakuro_save_v1` *and* a
  20-deep `kakuro-history` buffer that nothing reads. → single path.
- **b5. `esc()`/`_esc()`/`tbEsc()` ×3, `hexToRgb` ×2** → one copy each in
  `common.js`.
- Per-game `updateCellSize`/resize math stays per-game (boards genuinely
  differ; a shared helper would be indirection, not simplification).

### (c) Modularity / structure

- **c1.** 2048 wires buttons via inline `onclick=` attributes; every other
  game uses `addEventListener`. Standardize.
- **c2.** `#settingsBtn` is a `<button>` in 2048 but a `<div>` elsewhere
  (a11y). Standardize on `<button>`.
- **c3.** Kakuro's engine stays as an IIFE inside `kakuro.js` — splitting it
  out like `logic-engine.js` is deliberately out of scope (large risk, small
  payoff). Recorded as a non-goal.

### (d) Performance

- **d1.** `pushHistory` rewrites a 20-snapshot array to localStorage on
  every move in Sudoku (puzzle + solution + 81 pencil sets per snapshot) and
  2048; only the last snapshot is ever read. Minesweeper/Logic already use
  limit 2. → limit 2 everywhere.
- **d2.** Kakuro double-write per keystroke (= b4).
- **d3.** Minesweeper renders the board twice on a winning reveal.
- Checked and fine: 2048 particle system correctly culls, cancels rAF, and
  clears — no leak.

### (e) Consistency / convention drift

- **e1. Storage keys**: `2048best`, `kakuro_save_v1`, `kakuro_settings_v1`,
  `kakuro_tip_combos` break the documented `<game>-best/-cfg/-history`
  convention. Migration map:

  | old key | new key |
  |---|---|
  | `2048best` | `2048-best` |
  | `kakuro_settings_v1` | `kakuro-cfg` |
  | `kakuro_save_v1` | `kakuro-history` (last-entry snapshot) |
  | `kakuro_tip_combos` | `kakuro-cfg` field (`comboTipSeen`) |

- **e2. Labels/casing**: "New game" (2048) vs "New Game"; Sudoku's toggle
  says "Num First" vs settings "Number First"; notes button is "🔹 Pencil"
  (Sudoku) vs "🔹 Notes" (Kakuro). One convention: Title Case for button
  labels; matching wording for the same control across games.
- **e3. Button taxonomy** (the core unification). Target set, defined once:
  - `btn-primary` — accent CTA (New Game, overlay/banner primary action)
  - `btn` — secondary/toolbar action; modifiers `.danger`, `.active`
  - `icon-btn` — square icon button (gear, switcher, face)
  - `seg-btn` — segmented toggle option (inside `.seg-control`)
  - `num-btn` — numpad key (Sudoku/Kakuro)
  Replaces: `btn accent`, `btn-top`, `action-btn`, `btn-primary` (kept, now
  shared), `close`.
- **e4. End-game contract**: states that cover the board use the shared
  `#overlay`; states where the player should keep seeing/using the board use
  the shared `.banner` (2048 win with keep-going, 2048 loss, Minesweeper
  loss). Styling/markup shared; 2048's keep-going behavior untouched.
- **e5. Viewport meta**: game pages standardize on the locked variant
  (`maximum-scale=1.0, user-scalable=no`); index and theme-builder stay
  zoomable.
- **e6. Difficulty-change behavior** → decision 1 above.
- **e7. Doc drift**: CLAUDE.md lists a nonexistent `data/` dir, says 4 games
  (there are 5), documents a per-game `openSettings()` that is now shared in
  `theme.js`, omits Outdoor mode / `puzzle-contrast`. Fixed in the docs
  phase.

### (f) Dead code

- `findCell()` / `findCellEl()` in `2048.js` — never called.
- Unused `lim` in Sudoku `updateMistakeDots` (absorbed by a4).
- `kakuro-history` write-never-read (absorbed by b4/e1).
- `.btn-top.hidden` selector in `kakuro.css` — nothing toggles it there.
- Stale header comments (e.g. the "NOT in theme.css" lists in
  minesweeper.css/logic.css that the chrome extraction invalidates).

## Phases

| # | Phase | Plan doc | Status |
|---|---|---|---|
| 0 | Smoke-test harness + skill (safety net) | `cleanup-phase-0-smoke-test.md` | **planned — awaiting implementation** |
| 1 | Correctness fixes (a1–a4) | not yet written | — |
| 2 | UI unification + DRY (b1–b3, b5, c1, c2, e2–e5) | not yet written | — |
| 3 | Consistency: storage-key migration + Kakuro single persistence (e1, b4) + decisions 1 & 2 | not yet written | — |
| 4 | Performance (d1, d3) | not yet written | — |
| 5 | Polish: dead code, stale comments (f) | not yet written | — |
| 6 | Docs: `AGENTS.md` canonical, `CLAUDE.md` pointer, full reconcile | not yet written | — |
| 7 | Skills: `add-theme`, `add-game` (smoke-test skill ships in phase 0) | not yet written | — |
| 8 | opencode agent roster (`.opencode/agent/`) | not yet written | — |

Phase plans are written one at a time, after the previous phase is validated,
so each plan reflects the code as it actually is.

## Verification protocol (every phase)

1. `node tests/logic-engine.test.js` — green.
2. `node tests/smoke.test.js` — green (from phase 0 onward).
3. Load each affected game and exercise the changed surface by hand/script.
4. The phase's acceptance criteria (listed in its plan doc) all pass.
5. If a change touches a documented convention, the doc changes in the same
   commit.
