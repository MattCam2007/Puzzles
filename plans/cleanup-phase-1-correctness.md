# Phase 1 — correctness fixes (a1–a4)

Detailed implementation plan. Context and constraints:
`plans/cleanup-execution-plan.md`. Phase 0's smoke suite is the safety net —
run `node tests/smoke.test.js` and `node tests/logic-engine.test.js` before
every push (engine pass/fail is what matters; its assertion *count* varies
run-to-run by design).

Four independent fixes, **one commit each**, in this order. Each commit also
adds its regression check(s) to `tests/smoke.test.js` so the bug stays dead.
All fixes are user-invisible except where the bug itself was the visible
behavior.

---

## Fix 1 (a1) — game keyboard handlers leak into settings inputs

**Bug.** 2048, Sudoku and Minesweeper handle game keys on `document` with no
guard. With the settings sheet open: 2048 `preventDefault`s WASD/arrows so
they can't be typed into the `#bgImageUrl` field (and the board moves under
the sheet); Sudoku places typed digits onto the board; Minesweeper flags
cells on `f` and swallows Space. Kakuro already guards against the open
panel.

**Fix.** Add one shared helper to `js/common.js` (near the other DOM
helpers):

```js
/* true when a game's document-level key handler must ignore the event:
   focus is in a text-entry control, or the settings sheet is open */
function shouldIgnoreGameKeys(e) {
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' ||
            t.tagName === 'SELECT' || t.isContentEditable)) return true;
  const panel = document.getElementById('settingsPanel');
  return !!(panel && panel.classList.contains('show'));
}
```

Then, as the **first line** of each game's `document` keydown handler:

- `js/2048.js` (~line 762, the `KEYMAP` handler):
  `if (shouldIgnoreGameKeys(e)) return;`
- `js/sudoku.js` (~line 549): same, before the `cfg.useKeyboard` check.
- `js/minesweeper.js` (~line 522): same — importantly *before* the
  `if (cursor === null) cursor = [0, 0]` side effect.
- `js/kakuro.js` (~line 633): put the guard first and delete its now-
  redundant `if ($('#settingsPanel').classList.contains('show')) return;`
  line. Keep the overlay-Enter and combo-sheet blocks otherwise untouched
  (the guard can safely run before them: when the overlay or combo sheet is
  up, no input is focused and the panel is closed).

Do NOT guard on the overlay/banner being shown — Kakuro's Enter-to-restart
depends on keys working while the overlay is up.

**Smoke additions** (inside the existing 2048, sudoku, minesweeper, kakuro
suites — run these AFTER the existing state-survives-reload check, since the
board is already in a known state there):

1. Open settings (`#settingsBtn`), click `#bgImageUrl`, capture the game's
   existing `serialize()` value, then `page.keyboard.type(...)`:
   - 2048: type `wasd` → assert input value is `wasd` (before the fix the
     characters are swallowed) and `serialize()` unchanged.
   - sudoku: type `123` → input value `123`, board innerText unchanged.
   - minesweeper: type `f` → board innerText unchanged.
   - kakuro: type `5` → board innerText unchanged (already-working guard,
     kept as a regression check).
2. Clear the field via
   `page.evaluate(() => { document.getElementById('bgImageUrl').value = ''; })`
   (prevents the `change` handler from applying a garbage background URL on
   blur), then close settings via the backdrop.

---

## Fix 2 (a2) — finished games restore to a locked board with no end screen

**Bug.** Reload after game-over: `restore2048()` calls `hideOverlay()`
unconditionally, and `restoreSudoku()` force-removes `#overlay`'s `show`.
Result: a dead board that ignores input with no explanation. Minesweeper and
Logic already re-show their end state.

**Fix — `js/2048.js` `restore2048()`** (~line 686): replace the
unconditional `hideOverlay()` with:

```js
hideOverlay();
if (gameOver) {
  showOverlay(false);            // loss: re-show the Game Over banner
} else {
  gameWon = false;
  checkWin();                    // re-shows the win banner iff a milestone
}                                //   is reached and not yet acknowledged
```

Rationale: `showOverlay(false)` re-derives the loss banner exactly;
`checkWin()` re-derives the win-pending banner (correct milestone included)
from `grid` + `wonAcked`, and is a no-op if the player had already pressed
Keep Going. This also fixes the latent quirk where a restored
`gameWon: true` permanently disabled future win checks.

**Fix — `js/sudoku.js` `restoreSudoku()`** (~line 590): replace
`$('#overlay').classList.remove('show');` with:

```js
if (gameOver) {
  const won = playerBoard.every((row, r) => row.every((v, c) => v === solution[r][c]));
  endGame(won);                  // re-fills title/message and shows overlay
} else {
  $('#overlay').classList.remove('show');
}
```

`endGame` is idempotent here: `gameOver` is already true, the timer interval
was already cleared, and the message re-derives from restored `seconds` /
`mistakes` / `hintsUsed` / `cfg.strikeLimit`.

**Smoke additions** (place LAST in each suite — they end the game):

- 2048: `page.evaluate(() => { showOverlay(false); saveHistory(); })` →
  reload → assert `#banner` has class `show` and `#bannerTitle` text is
  `Game Over`.
- sudoku: `page.evaluate(() => { endGame(false); saveGameState(); })` →
  reload → assert `#overlay` has class `show` and `#overlayTitle` text
  contains `Game Over`.

(Calling the games' top-level functions from `page.evaluate` is fine — they
are global script functions.)

---

## Fix 3 (a3) — 2048 Animation Style / Tile Style reset on every reload

**Bug.** `currentAnim` / `currentTileMode` in `js/2048.js` are module
variables, never persisted.

**Fix.** Give 2048 the standard cfg pattern (top of `js/2048.js`, near the
other constants):

```js
const CFG_DEFAULTS = { anim: 'clean', tileMode: 'numbers' };
const cfg2048 = Object.assign({}, CFG_DEFAULTS, loadJSON('2048-cfg', {}));
function saveCfg() { saveJSON('2048-cfg', cfg2048); }
```

- Initialize with validation against the known ids (corrupt/stale storage
  must not select a nonexistent mode):
  `let currentAnim = ANIMS.some(a => a.id === cfg2048.anim) ? cfg2048.anim : 'clean';`
  and the equivalent for `currentTileMode` over `TILE_MODES`.
- In `selectAnim(id)` / `selectTileMode(id)`: also set the cfg field and
  call `saveCfg()`.
- Naming note: the file has no existing `cfg`; `cfg2048`/`CFG_DEFAULTS`
  avoids colliding with the `DEFAULTS`/`cfg` convention used by other games
  in case files are ever concatenated. If you prefer plain `cfg`/`DEFAULTS`
  to match the other games, that works too — scripts are per-page.
- The key name `2048-cfg` matches the documented `<game>-cfg` convention.

**Smoke addition** (2048 suite): open settings, click the Tile Style row
whose text includes `Hex` (rows are dynamic, no data attribute:
`[...document.querySelectorAll('#tilePicker .pick-row')].find(r => r.textContent.includes('Hex')).click()`),
assert some `#tc .tile` textContent starts with `0x`, reload, assert a tile
still starts with `0x` and `JSON.parse(localStorage.getItem('2048-cfg')).tileMode === 'hex'`.
Do this BEFORE the end-state check from Fix 2.

---

## Fix 4 (a4) — Sudoku lives indicator caps at 3 dots

**Bug.** `sudoku.html` hard-codes three dots (`#m1`–`#m3`) while the strike
limit can be 5, 10 or unlimited; past 3 the indicator stops meaning
anything. `updateMistakeDots` also computes an unused `lim`.

**Fix.**

- `sudoku.html`: empty the `.mistakes-indicator` container (remove the three
  `#m1/#m2/#m3` divs) and give it `id="mistakesIndicator"`.
- `js/sudoku.js`: rewrite `updateMistakeDots()` to render into
  `#mistakesIndicator` from current `cfg.strikeLimit` + `mistakes`:
  - limit 3 or 5 → render `limit` × `.mistake-dot`, adding `.used` for the
    first `mistakes` dots (same visual as today for limit 3);
  - limit 10 → render one `<span class="mistake-count">` with text
    `${mistakes}/10`;
  - limit 0 (unlimited) → `<span class="mistake-count">` with text
    `${mistakes}`.
  Drop the dead `lim` variable.
- Call `updateMistakeDots()` from the `.strike-opt` click handler (it
  currently only saves + syncs, so a limit change must now re-render the
  indicator too).
- `css/sudoku.css`: add one rule next to `.mistake-dot`:
  `.mistake-count { font-size: 0.82rem; font-weight: 700; color: var(--text); line-height: 1; }`
- Visibility rules (`cfg.showMistakeDots && cfg.checkMistakes` in
  `applySettingsToUI`) are unchanged.

This is a chrome-level display fix; mistake counting, the strike limit, and
game-over behavior are untouched.

**Smoke additions** (sudoku suite): assert `#mistakesIndicator .mistake-dot`
count is 3 on a fresh boot; open settings, click `.strike-opt[data-val="5"]`,
assert dot count becomes 5; click `.strike-opt[data-val="3"]` to restore the
default before the later checks run.

---

## Acceptance criteria

1. Four commits, one per fix, in the order above; message states what
   changed and why it is behavior-preserving (or which bug it fixes).
2. After each commit: `node tests/smoke.test.js` green and
   `node tests/logic-engine.test.js` reports 0 failed.
3. Final smoke run passes twice back-to-back.
4. The new smoke checks exist for: keyboard guard (4 games), end-state
   restore (2048 + sudoku), tile-mode persistence (2048), dynamic lives
   dots (sudoku) — and each was observed to FAIL before its fix was applied
   (implement the check first or verify via `git stash`; note this in the
   completion note).
5. Diff touches only: `js/common.js`, `js/2048.js`, `js/sudoku.js`,
   `js/minesweeper.js`, `js/kakuro.js`, `sudoku.html`, `css/sudoku.css`,
   `tests/smoke.test.js`, and (optionally) this plan file's status note.
6. Pushed to `claude/puzzles-cleanup-unify-09mq96`.

## Out of scope (do not do these now)

- Difficulty-select restart unification and timer pause-when-hidden
  (approved decisions, but they land in phase 3).
- Any button/label/CSS unification (phase 2).
- Storage-key renames (phase 3) — `2048-cfg` is a NEW key, not a rename.
- Kakuro's timer-off behavior, 2048 undo-after-reload: known quirks,
  intentionally preserved.
