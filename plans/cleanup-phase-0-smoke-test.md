# Phase 0 — smoke-test harness + skill

Detailed implementation plan. Context, constraints and the overall flow live
in `plans/cleanup-execution-plan.md`. **This phase touches no application
code** — it builds the safety net that makes the later refactor phases safe.

## Goal

A single command, `node tests/smoke.test.js`, that loads every page of the
suite in headless Chromium and proves each one boots clean, renders its
board, opens settings, applies+persists a theme, and survives a reload with
game state intact. Plus a repo skill that tells future agents to use it.

## Deliverables

1. `tests/smoke.test.js` — plain Node script, no test framework, no npm
   install, exits 0/1.
2. `.claude/skills/smoke-test/SKILL.md` — the skill wrapper.
3. `_config.yml` — add `.claude` to the Jekyll `exclude` list.
4. `CLAUDE.md` — add one line to the tests section documenting
   `node tests/smoke.test.js` (full doc overhaul comes in phase 6; only add
   the line).

## Environment facts (verified 2026-07-06 — do not re-derive)

- Node v22 at `/opt/node22/bin/node`; **no `package.json` exists and none
  may be added.**
- Playwright is installed **globally** (`npm root -g` →
  `/opt/node22/lib/node_modules`), but is NOT resolvable via a bare
  `require('playwright')` from the repo. This fallback is proven to work:

  ```js
  function loadPlaywright() {
    try { return require('playwright'); } catch (e) {}
    const { execSync } = require('child_process');
    const globalRoot = execSync('npm root -g').toString().trim();
    return require(require('path').join(globalRoot, 'playwright'));
  }
  ```

- Browsers are pre-installed at `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`.
  `chromium.launch()` (headless default) is verified working. **Never run
  `playwright install`.**
- Serve the repo with Node's built-in `http` module inside the test script
  (do not shell out to `python3 -m http.server`; do not depend on the
  global `http-server`). Listen on port `0` (OS-assigned) and read the real
  port from `server.address().port`. Minimal MIME map: `.html`, `.css`,
  `.js`, `.json`, `.svg`; anything else `application/octet-stream`; missing
  file → 404.

## Test architecture

- One shared browser, one **fresh browser context per page-suite** (contexts
  isolate localStorage — each game must start from a clean profile).
  Within a page-suite, reloads reuse the same context so persistence is
  actually exercised.
- Per-page hard timeout (30 s) so a hang fails instead of stalling; overall
  the run should finish well under 2 minutes.
- Console/error policy — collected for the whole life of each page,
  including after reloads:
  - FAIL on any `pageerror` (uncaught exception).
  - FAIL on any `console` message of type `error`, EXCEPT messages matching
    network noise: `/net::|Failed to load resource|ERR_/` — the sandbox may
    block the Google Fonts `@import` and that must not fail the suite.
  - FAIL on any **same-origin** request that 404s (catches broken
    script/css paths), except `/favicon.ico`.
- Output: one line per check, `✔`/`✘` with page name and check name; summary
  count at the end; `process.exitCode = 1` if anything failed.
- Optional CLI arg: `node tests/smoke.test.js sudoku` runs only page-suites
  whose name contains the arg (substring match). No other flags.

## Page suites and assertions

Checks marked **[reload]** happen after `page.reload()` in the same context.

### index.html
- 5 `.game-card` links present (2048, sudoku, kakuro, minesweeper, logic).
- Theme-builder link present.

### theme-builder.html
- `#tbEditors` has rendered token rows (`.tb-token-row` count > 0).
- Preview slides exist (`.tp-slide` count ≥ 1).

### Each game page — shared checks
1. **Boot**: game-specific board selector renders (below).
2. **Settings**: click `#settingsBtn` → `#settingsPanel` gains class `show`;
   click `#settingsBackdrop` → class removed. (Backdrop may be covered —
   dispatch the click via JS `el.click()` rather than a positional
   Playwright click.)
3. **Theme**: open settings, click `[data-theme-pick="terminal"]` →
   `document.documentElement.dataset.theme === 'terminal'`;
   **[reload]** still `terminal`.
4. **State survives reload**: perform the game's minimal interaction
   (below), capture the game's state serialization, **[reload]**, capture
   again, assert deep-equal. Also assert the game's history/save
   localStorage key is non-empty after the interaction.
5. Overlay sanity: `#overlay` (or 2048/minesweeper `#banner`) does NOT have
   class `show` on a fresh boot.

### Per-game specifics

| page | board-rendered check | minimal interaction | state serialization |
|---|---|---|---|
| `2048.html` | `#tc .tile` count ≥ 2 and `#bgGrid .bg-cell` count = 16 | dispatch `keydown` ArrowLeft, wait 300 ms, then ArrowUp, wait 300 ms, then ArrowRight, wait 300 ms (guarantees ≥1 real move regardless of spawn layout; waits cover the 55 ms slide animation + rAF) | `#score` text + sorted list of `#tc .tile` textContents (positions animate; values+score are stable) — storage key `2048-history` |
| `sudoku.html` | `#board .cell` count = 81, `.given` count > 0 | default input mode is **number-first**: click the first `#numpad .num-btn`, then click the first empty non-given cell (`.cell:not(.given)` whose textContent is empty). One possibly-wrong digit is fine (strike limit 3) | `#board` innerText — storage key `sudoku-history` |
| `kakuro.html` | wait for `.cell.white` to appear (generation is async — `setTimeout(20)` + up to a few hundred ms; use waitForSelector, 10 s cap) | click the first `.cell.white`, then dispatch `keydown` of digit `5` (keyboard path bypasses the dimmed-pad filter; autocheck is off by default so any digit is accepted) | `#board` innerText — storage key `kakuro_save_v1` (current name; phase 3 renames it — update this suite then) |
| `minesweeper.html` | `#board .cell` count = 16×16 = 256 (default intermediate) | click cell index 0 (`#board .cell` first) — first click is safe by default and reveals | `#board` innerText — storage key `minesweeper-history` |
| `logic.html` | `#board table.logic-grid` exists, `td.cell` count > 0 | click the first `td.cell` (cycles blank → ✓; auto-elim marks are deterministic from that) | `#board` innerText — storage key `logic-history` |

Notes:
- For 2048 the arrow keys must be dispatched to `document` (its handler is
  a document-level listener); use `page.keyboard.press('ArrowLeft')`.
- Sudoku/Kakuro timers tick during the test; do NOT include timer text in
  any serialization (that's why the board container, not `body`, is
  serialized — the timer lives in the header).
- Kakuro shows a one-time toast tip ~1.4 s after boot; ignore it (it writes
  `kakuro_tip_combos`; the fresh context per suite keeps this deterministic).

## Honesty check (one-off, not committed)

After the suite passes, temporarily add `throw new Error('smoke-canary')`
to the top of `js/sudoku.js`, re-run, and confirm the sudoku suite FAILS
with that pageerror. Revert. Record in the phase-0 completion note that this
was done. This proves the error collection isn't silently swallowing.

## Skill: `.claude/skills/smoke-test/SKILL.md`

Frontmatter + body, roughly:

```markdown
---
name: smoke-test
description: Run the headless-browser smoke suite that boots every game,
  checks console errors, settings, theme persistence, and save/reload
  round-trips. Use after ANY change to *.html, css/, or js/ — and before
  every commit during refactors.
---

# Smoke-test the puzzle suite

    node tests/smoke.test.js          # everything
    node tests/smoke.test.js sudoku   # one page-suite

Also run the engine tests: `node tests/logic-engine.test.js`.

## Interpreting failures
- `pageerror` → a real JS exception in that game; fix before anything else.
- `state mismatch after reload` → persistence/restore broke.
- Same-origin 404 → a script/css path is wrong.

## Environment notes
- Playwright resolves from the global npm root (the script handles this).
- Never run `playwright install`; browsers are at $PLAYWRIGHT_BROWSERS_PATH.
- Do not add a package.json — this repo has no dependencies by design.
```

Adjust wording as needed; keep it under ~60 lines. The skill must match how
the script actually behaves.

## Acceptance criteria

1. `node tests/smoke.test.js` passes on the **unmodified** app (this phase
   changes no app files) — run it twice back-to-back; both green
   (determinism).
2. `node tests/logic-engine.test.js` still green.
3. The honesty check above was performed and the canary failure observed.
4. `git diff` touches only: `tests/smoke.test.js`,
   `.claude/skills/smoke-test/SKILL.md`, `_config.yml`, `CLAUDE.md` (one
   line), and this plans file (status note, optional).
5. Committed in 1–2 commits with messages explaining the safety-net purpose;
   pushed to `claude/puzzles-cleanup-unify-09mq96`.

## Out of scope

- Fixing anything the smoke test flushes out (report it in the completion
  note instead — phase 1 owns the known bugs).
- Any change to js/css/html of the games.
- CI wiring, screenshots, visual diffs, perf measurement.

## Status (2026-07-06)

Done. `node tests/smoke.test.js` passes 58/58 twice back-to-back; the
canary check (temporary `throw new Error('smoke-canary')` at the top of
`js/sudoku.js`, reverted after) correctly failed the sudoku suite with a
`pageerror`. `node tests/logic-engine.test.js` still green (2307 passed).

One environment wrinkle not anticipated by this doc: the sandbox doesn't
just fail the Google Fonts `@import` in `css/theme.css` — it black-holes
the request, which stalls CSSOM (and therefore script execution / load
events) for ~13s per navigation. Three navigations per page-suite (initial
load + 2 reloads) blew the 30s per-page budget. Fixed by aborting
`https://fonts.googleapis.com/**` at the network layer via
`context.route(...)` so the request fails instantly instead of hanging.
No app code changed to work around this — it's isolated to the test
harness.
