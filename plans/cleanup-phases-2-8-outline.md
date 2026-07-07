# Phases 2–8 — high-level plans

High-level plans for the remaining cleanup phases. **Audience: the Opus
planner**, which expands ONE phase at a time into a detailed
`plans/cleanup-phase-<n>-*.md` before implementation begins on that phase.
Master context, audit findings (item ids like b1/e3 refer to it), approved
decisions, and hard constraints: `plans/cleanup-execution-plan.md`.

## What a detailed phase plan must contain

Follow the shape of `cleanup-phase-1-correctness.md` (it worked):

- Exact edit points per file (function names, approximate line refs from the
  *current* code — re-verify against HEAD, don't trust this outline's line
  numbers).
- Commit boundaries: each commit independently smoke-green.
- Regression checks added to `tests/smoke.test.js` per change, with the
  fail-before-fix requirement (observe each new check failing pre-change,
  record it in the commit body).
- Acceptance criteria incl. an explicit allowed-files list.
- An out-of-scope list naming the tempting adjacent work that must wait.
- Verification: `node tests/smoke.test.js` (twice at the end) and
  `node tests/logic-engine.test.js` (0 failed; pass count varies by design).

---

## Phase 2 — UI unification + DRY (the big one)

Goal: the five games share one chrome — one button system, one settings
panel source, one end-game pattern — with zero change to boards or theme
system. Audit items b1, b2, b3, b5, c1, c2, e2, e3, e4, e5. Split into four
sub-stages, each a separate commit (or small commit group), in this order:

### 2a — extract shared chrome CSS (zero visual change)

- New `css/chrome.css`, linked in all five game pages between `theme.css`
  and the game CSS (`theme-builder.css` stays last — it must remain the
  third-or-later link for `.pick-row-link`).
- Move the duplicated blocks out of the five game stylesheets: `.header`,
  `.header-right`, `.score-box`, `.btn` family, `.difficulty-select`
  (single copy of the data-URI arrow), `.board-top-bar` + left/right,
  `.overlay`/`.overlay-card`, `.banner` family, `.numpad`/`.num-btn` and the
  Sudoku/Kakuro action row.
- Where copies drifted, adopt the correct variant: active accent state uses
  `rgba(var(--accent-rgb), 0.3)` (Minesweeper/Logic version), NOT the
  hard-coded purple.
- Per-game page width: chrome rules use `var(--page-max)`; each game CSS
  sets it (420 for 2048/Sudoku/Kakuro, 600 Minesweeper, 640 Logic).
- Keep genuinely game-specific styles in the game files (mistakes-wrap,
  size-box, face-btn, story panel, toast, combo sheet…).
- Sharp edges: `.btn-top.hidden` semantics (Sudoku hides the Hint button via
  it) must survive; `index.html`/`theme-builder.html` do NOT load game CSS —
  decide whether they need chrome.css (index likely not; check).
- Verification beyond smoke: eyeball each game before/after at 420px and
  desktop width; the rendering should be pixel-identical except where a
  drifted copy was reconciled.

### 2b — button taxonomy + label sweep (visible chrome change)

- Target set (defined once in chrome.css, documented in phase 6):
  `btn-primary` (accent CTA: New Game, overlay/banner primary),
  `btn` (secondary/toolbar; modifiers `.danger`, `.active`, `.hidden`),
  `icon-btn`, `seg-btn`, `num-btn`.
- Class sweep across all five HTML files AND the JS that toggles these
  classes (`classList` calls in sudoku/kakuro/minesweeper/logic; 2048's
  banner buttons): `btn accent`→`btn-primary`, `btn-top`→`btn`,
  `action-btn`→`btn`, kakuro `.close`→`btn`, overlay `.btn-primary` stays.
- Label convention: Title Case everywhere — "New Game" (2048 currently "New
  game"), "Keep Going"; Sudoku mode toggle "Num First"→"Number First";
  notes toggle unified across Sudoku+Kakuro (recommend off-state
  "✏️ Notes", active-state visual from `.active`; whatever is chosen, both
  games use identical wording — current Sudoku says "Pencil", Kakuro
  "Notes").
- Theme-builder preview (`.tp-btn-accent`/`.tp-btn-ghost` and its "New
  game" label) mimics the chrome; update it so the preview stays
  representative. Decorative only — no functional coupling.
- Smoke additions: assert `#newGameBtn` carries `btn-primary` and its label
  is exactly "New Game" on every game page.

### 2c — shared settings panel + JS helper consolidation

- `theme.js` injects the shared settings sections at load into
  `#settingsPanel`: Appearance (theme pick-rows generated from the `THEMES`
  array — single source of truth; custom-themes list; build-a-theme link;
  board opacity; outdoor mode) and Background Image. Game HTML keeps only
  the panel shell + its game-specific sections. Preserve the existing id
  contract exactly (`bgUploadRow`, `bgImageFile`, `bgImageUrl`,
  `clearBgBtn`, `boardAlphaSlider`, `togOutdoor`, `customThemesList`,
  `[data-theme-pick]`) — the smoke suite and `syncThemePicker()` depend on
  it. Injection must complete before `initSettingsPanel()` runs (both live
  in theme.js — order within the file).
- Decide and document where shared sections sit relative to game sections
  (recommend: Appearance + Background first, game sections after — matches
  today's order in all five files).
- Move to `common.js`: one `onToggle(cfgObj, id, key, extra?)` used by all
  four games that have toggles (their local copies differ only in the cfg
  variable they close over — the shared version must take it as a
  parameter), one `escapeHtml()` (replacing `esc`/`_esc`/`tbEsc`), one
  `hexToRgb()` (theme.js + theme-builder.js copies).
- Smoke additions: injected sections present on every game page (pick-row
  count = THEMES length, bg controls present); existing settings/theme
  checks already cover behavior.

### 2d — end-game contract + structural nits

- Contract (document it): board-covering end states use shared `#overlay`;
  states that leave the board visible/usable use shared `.banner` (2048
  win-with-keep-going and loss; Minesweeper loss). Align the markup pattern
  and ids across the five pages; keep 2048's keep-going and Minesweeper's
  study-the-board behavior byte-for-byte.
- 2048: replace inline `onclick=` attributes with `addEventListener` (c1).
- `#settingsBtn` becomes `<button class="icon-btn">` on all pages (c2);
  Sudoku/Kakuro/Minesweeper/Logic currently use `<div>`.
- Viewport meta unified on game pages to the locked variant
  (`maximum-scale=1.0, user-scalable=no`); index/theme-builder stay
  zoomable (e5).

Phase-2 risk note for the detailed plan: this phase rewrites HTML that the
smoke suite's selectors depend on. Run the suite after every commit; if a
selector must change, change test and code in the same commit.

---

## Phase 3 — consistency: storage keys + approved behavior decisions

Audit items e1, b4; decisions 1 and 2. Suggested commits: (1) migration
helper + 2048/Kakuro key migrations + Kakuro single persistence, (2)
difficulty immediate-restart, (3) timer pause-when-hidden.

- `common.js`: `migrateKey(oldKey, newKey)` — if old exists and new
  doesn't: copy, then remove old. Called by game JS before first read.
- Migration map (from the execution plan): `2048best`→`2048-best`;
  `kakuro_settings_v1`→`kakuro-cfg`; `kakuro_save_v1`→ seed of
  `kakuro-history` (last-entry snapshot semantics); `kakuro_tip_combos`→
  `kakuro-cfg.comboTipSeen`. Kakuro then persists to ONE place
  (`kakuro-history`, limit 2) and `restore()` reads it; delete the
  double-write. Kakuro's settings-load pattern becomes the standard
  `Object.assign({}, DEFAULTS, loadJSON(...))` (kills the `??=` patches).
- Decision 1: Sudoku and Kakuro `#difficultySelect` gets a `change`
  listener that starts a new game (mirror minesweeper.js/logic.js).
- Decision 2: Sudoku, Kakuro, Minesweeper adopt Logic's `visibilitychange`
  pause pattern. Respect each game's existing timer rules (Kakuro's timer
  toggle; Minesweeper's timer only runs after first click and stops on
  game over). Judgment call for the detailed plan: a tiny shared timer
  helper is allowed ONLY if it is genuinely smaller than four adjusted
  copies — don't force it.
- Smoke additions: seeded-migration round trip per renamed key (write old
  key into localStorage before page load → assert new key holds the value,
  old key removed, game restored from it); difficulty-change restarts
  (sudoku: change select → board re-renders with a different puzzle);
  update the kakuro suite's storage-key reference if it still mentions
  `kakuro_save_v1` anywhere.
- Careful: migrations must run before any `loadJSON` of the new keys in the
  same file (top-of-file ordering).

## Phase 4 — performance

Audit d1, d3 (d2 lands with phase 3). Small; may share a PR with phase 5 as
separate commits.

- `pushHistory` limit 2 for `sudoku-history` and `2048-history` (explicit
  arg at the call sites). Old longer arrays self-trim on the next write; no
  migration needed — restore reads only the last entry.
- Minesweeper: eliminate the double render on a game-ending reveal
  (`checkWin`/`endGame` already render; the caller renders again). Smallest
  fix: after `checkWin()`, skip the follow-up `renderBoard()` when
  `gameOver` became true (same in `chordCell`).

## Phase 5 — polish / dead code

Audit (f) + leftovers. One or two commits.

- Delete `findCell()` / `findCellEl()` in 2048.js (re-grep first).
- Re-grep for selectors orphaned by phase 2's class sweep (e.g. old
  `.action-btn`, `.btn-top` rules, kakuro `.btn-top.hidden`) and delete.
- Fix stale comments: the "NOT in theme.css — each game owns its own copy"
  headers in minesweeper.css/logic.css and any comment phase 2 invalidated.
- `index.html`: move the inline-styled theme-builder link style into
  `css/index.css`.
- `css/theme.css`: `settings-panel` border-top hard-codes `#3d3a5a` →
  `var(--surface3)` (tiny visible correction on non-Galaxy themes; it's a
  token-drift fix, call it out in the commit).
- Nothing else opportunistic: if it isn't dead or stale, leave it.

## Phase 6 — agent docs: AGENTS.md canonical, CLAUDE.md pointer

The doc is a deliverable, not a patch (brief §"Agent documentation").

- Write `AGENTS.md` as the single source of truth. Required content, all
  reconciled against post-phase-5 reality:
  - What this is + how it's served (static, GitHub Pages, `_config.yml`
    excludes) and how to run/test it (server, smoke suite, engine tests,
    skills).
  - Project map (5 games — not 4; no `data/` dir unless one exists then).
  - **Invariants & contracts**: script load order; the settings-panel id
    contract (now partly injected by theme.js — document which ids the
    HTML must still provide); `puzzle-*` keys are theme.js-only; storage
    key convention table (`<game>-cfg/-history/-best`) + `migrateKey`;
    button taxonomy and where chrome lives; end-game overlay/banner
    contract; `--board-alpha` + `color-mix` transparency contract.
  - **Intentional non-goals**: boards/themes not unified; games are
    separate files on purpose; Kakuro engine stays embedded; no
    build/deps ever.
  - **Gotchas**: logic.js pairKey control-char separators; 2048
    `touch-action: none` vs the settings sheet; Kakuro async generation;
    Google Fonts import blocked in sandboxes (and how the smoke suite
    handles it); engine-test pass count varies by design.
  - How to verify a change (point at the smoke-test skill; point recipes
    at the add-theme/add-game skills once phase 7 lands — if phase 6 runs
    first, leave TODO markers OR reorder 6 after 7; the detailed planner
    picks and states the order).
  - Keep the still-true recipes (setting toggle, difficulty level) updated
    to the unified conventions.
- `CLAUDE.md` becomes a thin pointer. Prefer a one-line file containing
  `@AGENTS.md` (Claude Code import syntax) plus a "See AGENTS.md" sentence
  for humans/other tools; do NOT use a symlink (Windows checkouts). Never
  two full copies.
- `_config.yml`: exclude `AGENTS.md` and `.opencode`.
- Update `.claude/skills/smoke-test/SKILL.md` if any command/paths changed.

## Phase 7 — skills: add-theme, add-game

Repo skills in `.claude/skills/<name>/SKILL.md`, aligned with the
conventions AGENTS.md states (skill and doc must agree). Each skill must be
**verified end-to-end before commit** and the verification recorded in the
commit body.

- **add-theme**: after phase 2c, adding a theme is: token block in
  `theme.css` + entry in `THEMES` (pick-rows are generated — no per-game
  HTML edits anymore, which is the payoff to highlight) + 12 tile-color
  overrides in `2048.css` + optional light-theme overrides in
  sudoku/kakuro CSS + smoke run. The skill encodes the required token list,
  the fixed tokens that must NOT be overridden, and the verification steps.
  Verify by actually adding a scratch theme ("forest"), running the smoke
  suite with a theme-applies spot check, then reverting the scratch edits.
- **add-game**: distill `plans/adding-a-game.md` (887 lines, partially
  stale after unification) into a skill that stamps: `<game>.html` from the
  post-phase-2 template (shared chrome links, panel shell, required ids),
  `css/<game>.css` (sets `--page-max`, board styles), `js/<game>.js`
  skeleton (DEFAULTS/cfg via the shared helpers, `saveGameState`/restore,
  `syncSettingsUI`), a `.puzzle-option` in every page's switcher, an
  `index.html` card, and a smoke-suite page entry. Verify by stamping a
  trivial placeholder game, running smoke (it must boot clean), then
  removing it. The skill should also say what to update in AGENTS.md.
- Do NOT build add-setting-toggle / add-difficulty skills — the AGENTS.md
  recipes cover them; fewer, higher-quality skills (brief's explicit
  guidance).

## Phase 8 — opencode agent roster

`.opencode/agent/<name>.md`, per the brief's format and tier table (also
copied in the execution plan). No opencode binary exists in this
environment — verification is structural (frontmatter parses as YAML, every
`model:` slug matches the decision-3 list, tool/permission blocks are
least-privilege) plus cross-reference from AGENTS.md.

- Roster (8 files): `planner` (primary, `anthropic/claude-opus-4-8`),
  `fable-oracle` (subagent, `anthropic/claude-fable-5`, **read-only: no
  edit/write/bash**, prompt hard-codes: never auto-invoked, requires a
  stated justification and pre-distilled context, returns a decision not an
  implementation), `bug-hunter` + `refactorer` + `skill-author` (subagents,
  `anthropic/claude-sonnet-5`), `sweeper` (subagent,
  `anthropic/claude-haiku-4-5`, mechanical batches only), `docs-scribe`
  (subagent, `zai/glm-4.6`, docs-only edits), `verifier` (subagent,
  `zai/glm-4.6` or Haiku, read+bash, **no edit/write**).
- Every file: `description` specific enough to route on; `temperature` low
  (≈0.1) for appliers; `tools`/`permission` blocks scoped per the execution
  plan's table; body prompt states scope, method, what NOT to do, and when
  to escalate (sweeper→refactorer→planner→fable-oracle).
- Each `model:` line carries the comment: verify slug against the user's
  configured providers / models.dev before first use (decision 3).
- AGENTS.md gets a short "agent roster" section pointing here (same commit
  or a phase-6 follow-up — keep doc and roster in sync).

---

## Sequencing note for the detailed planner

2 → 3 → 4 → 5 must run in order (later phases grep the post-unification
code). For 6/7/8: recommend 7's skills be built against the settled code
(after 5), and 6 written last-or-with-7 so AGENTS.md can reference the
skills as they actually exist; 8 anytime after 6's roster section has a home.
Simplest safe order: 2, 3, 4+5, 7, 6, 8 — but the detailed planner may
reorder 6/7/8 with a stated reason.
