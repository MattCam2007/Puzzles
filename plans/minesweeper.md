# Plan: Add Minesweeper as the 4th puzzle

Goal: add **classic Windows Minesweeper** as a fourth game, wired into the suite
**exactly** the way 2048, Sudoku and Kakuro are — same file layout, same shared
CSS/JS, same header/switcher/settings/overlay patterns, same theming. The game
logic and difficulty presets match classic Windows Minesweeper; only the skin is
this app's design language.

---

## 1. Architecture recap (the pattern every game follows)

Each game is exactly three files plus shared infra:

| Per-game file        | Shared infra (do not fork)        |
| -------------------- | --------------------------------- |
| `<game>.html`        | `css/theme.css` (tokens, header, settings sheet, switcher, sliders) |
| `css/<game>.css`     | `css/theme-builder.css` (custom-theme picker rows) |
| `js/<game>.js`       | `js/common.js` (`$`, `$$`, `loadJSON`, `saveJSON`, `pushHistory`, `shuffle`, `formatTime`, puzzle switcher) |
|                      | `js/theme.js` (`applyTheme`, `syncThemePicker`, bg image, board alpha) |

Conventions confirmed from the existing three games:

- **HTML head**: `theme.css` → `css/<game>.css` → `theme-builder.css`, in that order.
- **Header** (`.header` / `.header-right`): gradient `.title`, one or more
  `.score-box` stat readouts, the **puzzle switcher** dropdown, and the `⚙️`
  settings button. Switcher markup is identical in all games and `common.js`
  auto-marks the current page + handles open/close.
- **Top bar** (`.board-top-bar`): left = `New Game` (`.btn.accent`) + a
  `.difficulty-select`; right = `.board-top-right` action buttons (`.btn-top`).
- **Board** inside `.board-wrap` (`max-width:420px`).
- **Settings**: shared bottom-sheet (`.settings-panel`) opened by `#settingsBtn`,
  closed by `#settingsBackdrop`. First two sections are **always** the shared
  *Appearance* (theme picks + `#customThemesList` + board-opacity slider) and
  *Background Image* blocks — copied verbatim. Game-specific sections follow.
- **Win/lose**: shared `.overlay` / `.overlay-card` with `#overlayTitle`,
  `#overlayMsg`, `#overlayBtn`.
- **Scripts**, in order: `js/common.js` → `js/theme.js` → `js/<game>.js`.
- **State**: `cfg = Object.assign({}, DEFAULTS, loadJSON('<game>-cfg', {}))`,
  `saveCfg()`; in-progress game persisted via `pushHistory('<game>-history', …)`
  and restored on load (`if (!restore()) startGame();`).
- **Theme picker** wired by calling shared `syncThemePicker()` inside
  `openSettings()`.

Minesweeper will mirror **all** of the above 1:1.

---

## 2. Classic Windows Minesweeper rules to implement

- **Difficulty presets** (exact classic values):
  - **Beginner** — 9×9, 10 mines
  - **Intermediate** — 16×16, 40 mines
  - **Expert** — 30 wide × 16 tall, 99 mines
- **Reveal** a covered cell: if it's a mine → lose; else show the count of
  mines in its 8 neighbours; if the count is 0, **flood-fill** open all adjacent
  cells recursively (classic behaviour).
- **Flag / question**: right-click (desktop) or long-press / flag-mode (touch)
  cycles covered → 🚩 flag → ❓ question → covered. Question marks are a
  classic toggleable option (on by default, like Windows).
- **Chording**: clicking an already-revealed number whose adjacent flag count
  equals the number reveals all its other neighbours (classic middle-click /
  both-button behaviour). Exposed on touch by tapping a satisfied number.
- **First-click safety**: classic Windows guarantees the **first revealed cell
  is never a mine** — mines are placed *after* the first click (relocate the
  mine if it landed there). Implemented by deferring mine layout to first reveal.
- **Mine counter**: mines minus flags placed (can go negative, like classic).
- **Timer**: starts on first reveal, stops on win/lose; classic caps display but
  we'll just use the shared `formatTime`.
- **Win**: every non-mine cell revealed. On win, auto-flag remaining mines.
- **Lose**: reveal a mine → reveal all mines, mark the detonated one, X wrong
  flags (classic end-of-game reveal).
- **Best times** per difficulty persisted in localStorage (classic feature),
  surfaced in the win overlay and a header `Best` stat.

---

## 3. Files to create

### 3.1 `minesweeper.html`
Clone the structure of `sudoku.html` / `kakuro.html`:

- Head: `theme.css` → `css/minesweeper.css` → `theme-builder.css`, title
  "Minesweeper", same viewport meta as Sudoku/Kakuro (`maximum-scale=1` — no
  zoom, since long-press is used).
- `.header`:
  - `.title` → "Minesweeper"
  - `.score-box` **Mines** (`#mineCount`) — mines remaining
  - `.score-box` **Time** (`#timer`)
  - `.score-box` **Best** (`#bestTime`) — best for current difficulty
  - a reset **face** button (classic 🙂 / 😎 / 😵) styled as an `.icon-btn`
    (`#faceBtn`) that doubles as New Game — a nod to classic, app-styled
  - puzzle-switcher dropdown (now **four** options, see §4)
  - `#settingsBtn` gear
- `.board-top-bar`:
  - left: `New Game` (`.btn.accent`, `#newGameBtn`) + `.difficulty-select`
    (`#difficultySelect`: Beginner / Intermediate / Expert)
  - right (`.board-top-right`): `🚩 Flag` mode toggle (`.btn-top`, `#flagModeBtn`)
- `.board-wrap` → `.board#board` (grid built in JS; see §5 for sizing).
- **Settings panel** — shared Appearance + Background Image sections copied
  verbatim, then game-specific sections:
  - *Gameplay*: toggles — **Question marks** (`#togQuestion`), **First-click
    safe** (`#togSafeFirst`), **Chording** (`#togChord`), **Long-press to flag**
    (`#togLongPress`).
  - *Input*: **Use physical keyboard** (`#togKeyboard`), reuse pattern from Sudoku.
- Win/lose `.overlay` card (`#overlayTitle` / `#overlayMsg` / `#overlayBtn`).
- Scripts: `common.js` → `theme.js` → `minesweeper.js`.

### 3.2 `css/minesweeper.css`
Same header used by `theme.css`. Reuse `.header`, `.score-box`,
`.board-top-bar`, `.btn`, `.btn-top`, `.difficulty-select`, `.overlay*` exactly
as the other games (these live in `theme.css` + per-game css; Minesweeper's css
will define the game-specific board/cell classes only). New rules:

- `.board` as a CSS grid driven by `--cols` / `--rows` custom properties set in
  JS; cells fixed by `--cell` size. Because Intermediate/Expert are larger and
  Expert is **30×16 (non-square)**, the board cannot keep `aspect-ratio:1`.
  Strategy:
  - Compute `--cell` in JS from available width and column count, clamped to a
    sensible min (e.g. 16px). Beginner/Intermediate fit the 420px column; Expert
    overflows → `.board-wrap` gets `overflow:auto` and the board uses its
    natural pixel size so it pans horizontally on mobile (classic feel),
    centered on desktop.
- Cell states: `.cell.covered` (raised surface look using `--surface2`/borders),
  `.cell.revealed` (flat `--cell-empty`), `.cell.flag`, `.cell.question`,
  `.cell.mine`, `.cell.exploded` (detonated mine, `--error` bg),
  `.cell.wrong-flag` (✗ over flag on loss).
- Number colors `.n1`…`.n8` — classic palette (1 blue, 2 green, 3 red, 4 navy,
  5 maroon, 6 teal, 7 black/white, 8 grey) but pulled toward theme tokens so all
  four themes (galaxy/midnight/sakura/terminal) stay legible; define per-theme
  overrides at the bottom of the file the way `sudoku.css` overrides `--given`
  for sakura.
- Honor `--board-alpha` via `color-mix(... var(--board-alpha) ...)` exactly like
  the Sudoku board so the board-opacity slider works.
- `.face-btn` styling for the reset face.

### 3.3 `js/minesweeper.js`
Mirror `sudoku.js` structure and idioms:

1. **`DEFAULTS` + `cfg`**: `difficulty:'beginner'`, `questionMarks:true`,
   `safeFirst:true`, `chording:true`, `longPressFlag:true`, `useKeyboard:true`.
   `loadJSON('minesweeper-cfg', {})` + `saveCfg()`.
2. **Presets**: `const LEVELS = { beginner:{cols:9,rows:9,mines:10}, intermediate:{cols:16,rows:16,mines:40}, expert:{cols:30,rows:16,mines:99} }`.
3. **Engine** (pure, mirrors `generateSolved`/`isValid` style):
   - `state`: `cols, rows, mines`, `mineSet` (Set of indices), `revealed`,
     `flags` (0=none,1=flag,2=question), `counts`, `started`, `gameOver`,
     `win`, `firstClickDone`.
   - `placeMines(safeIndex)` — random placement excluding the first-clicked cell
     (and optionally its neighbours for a guaranteed open start) using `shuffle`
     from `common.js`; deferred until first reveal for first-click safety.
   - `neighbors(i)`, `computeCounts()`, `floodReveal(i)` (iterative stack),
     `revealCell(i)`, `toggleFlag(i)`, `chord(i)`, `checkWin()`.
4. **Rendering** (mirrors `renderBoard`): build the grid once per new game,
   set `--cols`/`--rows`/`--cell`; update cell classes/text on each action
   (re-render touched cells, not the whole board, for Expert perf).
5. **Interaction**:
   - `pointerdown`/`click` reveal; `contextmenu` → flag (preventDefault);
     long-press (timer on `pointerdown`, ~450ms) → flag on touch;
     `#flagModeBtn` toggles tap-to-flag for touch users.
   - Tap on a revealed number → `chord` when `cfg.chording`.
   - Keyboard (when `cfg.useKeyboard`): arrows to move a cursor, Space/Enter to
     reveal, `F` to flag — same opt-in pattern as Sudoku.
6. **Timer**: `tickTimer`/`formatTime` reused from `common.js`; start on first
   reveal, `clearInterval` on end.
7. **Mine counter** `#mineCount` = `mines − flagCount`.
8. **Face button** reflects state: 🙂 idle, 😮 on pointerdown, 😎 win, 😵 loss.
9. **End game** (`endGame(won)`): reveal mines / mark wrong flags, stop timer,
   update best time (`loadJSON('minesweeper-best', {})` keyed by difficulty),
   fill `.overlay` (title "🎉 Cleared!" / "💥 Boom!", msg with time + best),
   `show` overlay. `#overlayBtn` and `#faceBtn` → `startGame()`.
10. **Settings → UI**: `applySettingsToUI()` + `syncSettingsUI()` matching
    Sudoku's wiring; `onToggle(...)` helper for each toggle; `openSettings()`
    calls `syncThemePicker()`.
11. **Persistence/restore**: `saveGameState()` via
    `pushHistory('minesweeper-history', snapshot)` (store mineSet/flags/revealed
    as arrays); `restoreMinesweeper()` rehydrates Sets; `if (!restoreMinesweeper()) startGame();`.
12. **Responsive sizing**: `updateCellSize()` on resize (like Sudoku) computing
    `--cell` from `.board-wrap` width ÷ cols with a min, enabling Expert scroll.

---

## 4. Wire the new game into the suite (the "integrated exactly" part)

1. **`index.html`** — add a 4th `.game-card` after Kakuro:
   ```html
   <a class="game-card" href="minesweeper.html">
     <span class="emoji">💣</span>
     <span class="meta">
       <span class="name">Minesweeper</span>
       <span class="desc">Clear the grid without detonating a mine</span>
     </span>
     <span class="chevron">›</span>
   </a>
   ```
2. **Puzzle switcher dropdown** — add the same 4th option to **all four**
   game pages (`2048.html`, `sudoku.html`, `kakuro.html`, `minesweeper.html`):
   ```html
   <a href="minesweeper.html" class="puzzle-option">💣 Minesweeper</a>
   ```
   (`common.js` already auto-tags the current page and needs no change.)

Emoji choice: 💣 (distinct from the existing 🔢 ✏️ ➕). 🚩 reserved for the
flag-mode button.

---

## 5. Styling / UX decisions to match the app

- All shared chrome (header, stat boxes, buttons, settings sheet, switcher,
  overlay, theme picker, background image, board-opacity slider) is **reused
  verbatim** — no visual divergence from the other three games.
- Board uses theme tokens (`--surface2` covered, `--cell-empty` revealed,
  `--accent`/`--error` for state) so it recolors correctly under all four
  built-in themes **and** any custom theme from the Theme Builder, and respects
  the board-opacity slider and background image.
- Classic-feel touches kept but skinned: numbered color palette, the reset
  face, mine/flag glyphs (💣/🚩/❓), end-game mine reveal + wrong-flag ✗.
- Mobile-first: long-press + flag-mode toggle for flagging; Expert board pans
  horizontally inside `.board-wrap` rather than shrinking cells to unreadable.

---

## 6. Verification

No build system (static HTML/JS/CSS opened directly). Verify by:

- Open `minesweeper.html` locally; play each difficulty (9×9/16×16/30×16),
  confirm mine counts, flood-fill, chording, first-click safety, win/lose
  overlay, best-time persistence, and game restore after reload.
- Switch between all four games via the dropdown and the home grid; confirm the
  current-page highlight works on every page.
- Cycle all four themes + a custom theme + background image + opacity slider on
  the Minesweeper board.
- Check Beginner/Intermediate fit width; Expert scrolls; layout holds on a
  narrow mobile viewport.

---

## 7. Deliverables / commits

1. `css/minesweeper.css`, `js/minesweeper.js`, `minesweeper.html` (new game).
2. Edits to `index.html` + switcher dropdowns in `2048.html`, `sudoku.html`,
   `kakuro.html`.
3. Commit to `claude/add-minesweeper-puzzle-7c8tl6` and push. (No PR unless
   requested.)
</content>
</invoke>
