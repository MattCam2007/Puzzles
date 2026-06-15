# Adding a New Game to the Puzzle Suite

A complete developer reference for wiring a new game into the suite.
All claims here have been verified against the live codebase.

---

## 1. Architecture overview

The suite is static HTML/CSS/JS — no build step, no bundler. Each game is
three files. Everything else is shared.

```
Puzzles/
├── index.html              ← home page / game picker
├── <game>.html             ← your new game
├── css/
│   ├── theme.css           ← shared design tokens + settings chrome
│   ├── theme-builder.css   ← shared pick-row-link, pick-arrow, toast styles
│   ├── index.css           ← home page styles only
│   └── <game>.css          ← your new game (owns layout classes too — see §3)
└── js/
    ├── common.js           ← $, $$, loadJSON/saveJSON, pushHistory,
    │                          shuffle, formatTime, puzzle switcher
    ├── theme.js            ← theme apply/load, syncThemePicker, bg image,
    │                          board opacity
    └── <game>.js           ← your new game
```

**Critical fact:** `theme.css` does **not** define `.header`, `.score-box`,
`.board-top-bar`, `.btn`, `.btn-top`, `.difficulty-select`, `.board-wrap`,
`.overlay`, or `.banner`. Those classes are defined independently in each
game's CSS. If you omit them from your game's CSS, the page is unstyled.
The safe approach is to copy the shared block from `sudoku.css` or
`kakuro.css` (the two most complete examples) and then add your game-specific
rules below.

What `theme.css` *does* provide:
- All CSS custom properties (design tokens)
- Four built-in theme overrides (`midnight`, `sakura`, `terminal`)
- Reset (`*`, `html`, `body` base, `user-select: none`)
- `.title` gradient wordmark
- `.icon-btn` (gear, switcher button)
- The settings bottom-sheet: `.settings-backdrop`, `.settings-panel`,
  `.settings-handle`, `.settings-title`, `.settings-section`,
  `.settings-section-label`, `.setting-row`, `.setting-info`, `.setting-name`,
  `.setting-desc`, `.toggle`, `.toggle-slider`
- `.seg-control` / `.seg-btn` (segmented control)
- `.strike-picker` / `.strike-opt` (option chip row)
- `.pick-row`, `.pick-icon`, `.pick-check`
- `.settings-text-input`, `.settings-slider`
- The puzzle-switcher dropdown: `.puzzle-switcher-wrap`, `.puzzle-dropdown`,
  `.puzzle-option`

What `theme-builder.css` provides (must be the third `<link>` in `<head>`):
- `.pick-row-link`, `.pick-arrow` — the "Build a theme ›" link row in settings
- `.toast` — if you ever need toast notifications

---

## 2. Checklist

- [ ] `<game>.html` created
- [ ] `css/<game>.css` created (includes shared layout block)
- [ ] `js/<game>.js` created
- [ ] `index.html` — new `.game-card` entry added
- [ ] `<game>.html` — all four `.puzzle-option` entries in the switcher dropdown
- [ ] All other game pages updated — `💣 Minesweeper` entry pattern: add
      `<a href="<game>.html" class="puzzle-option">EMOJI Name</a>` to the
      `#puzzleDropdown` in every existing game page

---

## 3. `<game>.html` template

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0,
      maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
<title>My Game</title>
<link rel="stylesheet" href="css/theme.css">
<link rel="stylesheet" href="css/mygame.css">
<link rel="stylesheet" href="css/theme-builder.css">
</head>
<body>

<!-- ── HEADER ── -->
<div class="header">
  <div class="title">My Game</div>
  <div class="header-right">
    <!-- stat boxes — add as many as you need -->
    <div class="score-box">
      <div class="label">Score</div>
      <div class="value" id="score">0</div>
    </div>
    <!-- puzzle switcher — copy exactly, update hrefs -->
    <div class="puzzle-switcher-wrap">
      <button class="icon-btn puzzle-switcher-btn"
              id="puzzleSwitcherBtn" title="Switch puzzle">☰</button>
      <div class="puzzle-dropdown" id="puzzleDropdown">
        <a href="2048.html"        class="puzzle-option">🔢 2048</a>
        <a href="sudoku.html"      class="puzzle-option">✏️ Sudoku</a>
        <a href="kakuro.html"      class="puzzle-option">➕ Kakuro</a>
        <a href="minesweeper.html" class="puzzle-option">💣 Minesweeper</a>
        <a href="mygame.html"      class="puzzle-option">🎯 My Game</a>
      </div>
    </div>
    <div class="icon-btn" id="settingsBtn" title="Settings">⚙️</div>
  </div>
</div>

<!-- ── TOP BAR ── -->
<div class="board-top-bar">
  <div class="board-top-left">
    <button class="btn accent" id="newGameBtn">New Game</button>
    <!-- optional: difficulty select -->
    <select class="difficulty-select" id="difficultySelect">
      <option value="easy">Easy</option>
      <option value="medium" selected>Medium</option>
      <option value="hard">Hard</option>
    </select>
  </div>
  <div class="board-top-right">
    <button class="btn-top" id="hintBtn">💡 Hint</button>
  </div>
</div>

<!-- ── BOARD ── -->
<div class="board-wrap">
  <div class="board" id="board"></div>
</div>

<!-- ── SETTINGS PANEL ── -->
<!-- The first two sections (Appearance + Background Image) are ALWAYS
     copied verbatim. game.js calls syncThemePicker() inside openSettings().
     Add game-specific sections after. -->
<div class="settings-backdrop" id="settingsBackdrop"></div>
<div class="settings-panel" id="settingsPanel">
  <div class="settings-handle"></div>
  <div class="settings-title">Settings</div>

  <div class="settings-section">
    <div class="settings-section-label">Appearance</div>
    <div class="pick-row" data-theme-pick="galaxy">
      <span class="pick-icon">🌌</span>Galaxy<span class="pick-check">✓</span>
    </div>
    <div class="pick-row" data-theme-pick="midnight">
      <span class="pick-icon">🌊</span>Midnight<span class="pick-check">✓</span>
    </div>
    <div class="pick-row" data-theme-pick="sakura">
      <span class="pick-icon">🌸</span>Sakura<span class="pick-check">✓</span>
    </div>
    <div class="pick-row" data-theme-pick="terminal">
      <span class="pick-icon">💻</span>Terminal<span class="pick-check">✓</span>
    </div>
    <div id="customThemesList"></div>
    <a href="theme-builder.html" class="pick-row-link">
      <span class="pick-icon">🎨</span>Build a theme<span class="pick-arrow">›</span>
    </a>
    <div class="setting-row">
      <div class="setting-info">
        <div class="setting-name">Board opacity</div>
      </div>
      <input type="range" id="boardAlphaSlider"
             min="0" max="100" value="100" class="settings-slider">
    </div>
  </div>

  <div class="settings-section">
    <div class="settings-section-label">Background Image</div>
    <div class="pick-row" id="bgUploadRow">
      <span class="pick-icon">📁</span>Upload from device<span class="pick-check">✓</span>
      <input type="file" accept="image/*" id="bgImageFile" style="display:none">
    </div>
    <div class="bg-url-row">
      <input type="text" id="bgImageUrl" class="settings-text-input"
             placeholder="Paste image URL…">
    </div>
    <div class="pick-row" id="clearBgBtn">
      <span class="pick-icon">✕</span>No background<span class="pick-check">✓</span>
    </div>
  </div>

  <!-- ── YOUR GAME-SPECIFIC SETTINGS GO HERE ── -->
  <div class="settings-section">
    <div class="settings-section-label">Gameplay</div>
    <div class="setting-row">
      <div class="setting-info">
        <div class="setting-name">My toggle</div>
        <div class="setting-desc">Explanation shown to the user.</div>
      </div>
      <label class="toggle">
        <input type="checkbox" id="togMyOption" checked>
        <span class="toggle-slider"></span>
      </label>
    </div>
  </div>

</div>

<!-- ── WIN/LOSE OVERLAY ── -->
<!-- Use this for win, or for loss when you want to cover the board.
     For loss where the board should stay visible, use .banner instead
     (see §7 Non-covering banner). -->
<div class="overlay" id="overlay">
  <div class="overlay-card">
    <h2 id="overlayTitle">You Win!</h2>
    <p id="overlayMsg"></p>
    <button class="btn-primary" id="overlayBtn">Play Again</button>
  </div>
</div>

<!-- scripts: always this order -->
<script src="js/common.js"></script>
<script src="js/theme.js"></script>
<script src="js/mygame.js"></script>
</body>
</html>
```

**Required IDs for shared systems** — these must exist in your HTML exactly
as named or the shared JS will silently no-op:

| ID | Required by | Purpose |
|----|-------------|---------|
| `puzzleSwitcherBtn` | `common.js` | Opens switcher dropdown |
| `puzzleDropdown` | `common.js` | The dropdown element; auto-marks current page |
| `.puzzle-option` | `common.js` | Each `<a>` href is compared to current filename |
| `settingsBackdrop` | your JS | Close settings on outside tap |
| `settingsPanel` | your JS | The bottom sheet |
| `customThemesList` | `theme.js` | Injects custom theme pick-rows |
| `bgUploadRow` | `theme.js` | Upload bg image |
| `bgImageFile` | `theme.js` | Hidden file input |
| `bgImageUrl` | `theme.js` | URL text input |
| `clearBgBtn` | `theme.js` | Remove bg image |
| `boardAlphaSlider` | `theme.js` | Board opacity slider |
| `[data-theme-pick]` | `theme.js` | Built-in theme rows |

---

## 4. `css/<game>.css` — the shared layout block

**Copy this block verbatim** from `sudoku.css` or `kakuro.css` into your
game's CSS first. These classes are NOT in `theme.css`.

```css
/* ── HEADER ── */
.header {
  width: 100%; max-width: 420px;
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 12px;
}
.title { font-size: 2.2rem; }
.header-right { display: flex; gap: 8px; align-items: center; }
.score-box {
  background: var(--surface); border-radius: var(--radius-sm);
  padding: 5px 11px; text-align: center; min-width: 54px;
}
.score-box .label {
  font-size: 0.58rem; font-weight: 700; color: var(--text-muted);
  text-transform: uppercase; letter-spacing: 1px;
}
.score-box .value { font-size: 0.95rem; font-weight: 700; }

/* ── DIFFICULTY SELECT ── */
.difficulty-select {
  flex: none; background: var(--surface); border: 1px solid var(--surface3);
  color: var(--text); font-family: 'Space Grotesk', sans-serif;
  font-size: 0.85rem; font-weight: 600; padding: 8px 28px 8px 10px;
  border-radius: var(--radius-sm); outline: none; cursor: pointer;
  appearance: none; -webkit-appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%236b6880' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat; background-position: right 10px center;
}

/* ── BUTTONS ── */
.btn {
  background: var(--surface); border: 1px solid var(--surface3);
  color: var(--text); font-family: 'Space Grotesk', sans-serif;
  font-size: 0.8rem; font-weight: 600; padding: 8px 14px;
  border-radius: var(--radius-sm); cursor: pointer;
  transition: background 0.15s; white-space: nowrap;
}
.btn:active { background: var(--surface3); }
.btn.accent { background: var(--accent-dim); border-color: var(--accent); color: var(--accent2); }
.btn.accent:active { background: rgba(var(--accent-rgb), 0.3); }

/* ── BOARD TOP BAR ── */
.board-top-bar {
  width: 100%; max-width: 420px;
  display: flex; flex-wrap: wrap; align-items: center;
  gap: 8px; margin-bottom: 8px;
}
.board-top-left { display: flex; gap: 8px; align-items: center; }
.board-top-right { display: flex; gap: 6px; align-items: center; margin-left: auto; }
.btn-top {
  background: var(--surface); border: 1px solid var(--surface3);
  color: var(--text-dim); font-family: 'Space Grotesk', sans-serif;
  font-size: 0.78rem; font-weight: 600; padding: 7px 12px;
  border-radius: var(--radius-sm); cursor: pointer;
  transition: background 0.15s; white-space: nowrap;
}
.btn-top:active { background: var(--surface3); }

/* ── BOARD ── */
.board-wrap { width: 100%; max-width: 420px; aspect-ratio: 1; }
.board {
  width: 100%; height: 100%;
  /* your grid definition here */
}

/* ── OVERLAY ── */
.overlay {
  position: fixed; inset: 0; background: rgba(15,15,19,0.9);
  display: flex; align-items: center; justify-content: center;
  z-index: 100; backdrop-filter: blur(4px);
  opacity: 0; pointer-events: none; transition: opacity 0.3s;
}
.overlay.show { opacity: 1; pointer-events: all; }
.overlay-card {
  background: var(--surface); border: 1px solid #3d3a5a;
  border-radius: 16px; padding: 32px 28px; text-align: center;
  max-width: 300px; width: 90%;
}
.overlay-card h2 {
  font-size: 1.8rem; font-weight: 800;
  background: linear-gradient(135deg, var(--accent), var(--accent2));
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  background-clip: text; margin-bottom: 8px;
}
.overlay-card p { color: var(--text-dim); font-size: 0.88rem; margin-bottom: 24px; line-height: 1.55; }
.overlay-card .btn-primary {
  background: linear-gradient(135deg, var(--accent), var(--accent2));
  border: none; color: white; font-family: 'Space Grotesk', sans-serif;
  font-size: 0.95rem; font-weight: 700; padding: 12px 28px;
  border-radius: var(--radius-sm); cursor: pointer; width: 100%;
}
```

**Board opacity** — use `color-mix` on every surface color inside the board
so the opacity slider works:

```css
.board {
  background: color-mix(in srgb, var(--surface3) var(--board-alpha), transparent);
}
.cell {
  background: color-mix(in srgb, var(--cell-empty) var(--board-alpha), transparent);
}
```

**Adjusting `max-width`** — standard games use `420px`. If your game has a
wider board (e.g. Expert Minesweeper is 30 columns), set a higher value on
`.header` and `.board-top-bar` to match and add `overflow-x: auto` to
`.board-wrap` so wide boards pan rather than shrink.

---

## 5. Design tokens reference

All tokens live in `theme.css :root`. Use only these in your CSS.

```
Surfaces          --bg, --surface, --surface2, --surface3, --cell-empty
Accent            --accent, --accent2, --accent-dim, --accent-dim2
Accent RGB        --accent-rgb, --accent2-rgb    (for rgba() usage)
Secondary colour  --cyan                         (functional, used by Kakuro)
Text              --text, --text-muted, --text-dim
Status            --error, --success, --warn
Shape             --radius, --radius-sm
Board alpha       --board-alpha                  (set by theme.js from slider)
Background        --bg-image                     (set by theme.js)
```

**Writing theme overrides** — add game-specific token overrides at the bottom
of your game CSS, scoped to the theme attribute:

```css
html[data-theme="sakura"] {
  /* light bg needs darker text colours for your cells */
  --my-cell-text: #2d1820;
}
```

---

## 6. `js/<game>.js` — required structure

The shared systems expect your JS to follow this structure. Deviating from
it breaks settings, restore-on-reload, and the switcher.

### 6.1 Config / settings state

```js
const DEFAULTS = {
  myOption: true,
  // ... all settings with their default values
};

let cfg = Object.assign({}, DEFAULTS, loadJSON('mygame-cfg', {}));
function saveCfg() { saveJSON('mygame-cfg', cfg); }
```

`loadJSON` / `saveJSON` come from `common.js`. The key must be
`'<game>-cfg'` — use your game's filename without `.html`.

### 6.2 Game state

```js
let gameOver = false;
let seconds = 0;
let timerInterval = null;
// ... your game-specific state variables
```

### 6.3 startGame()

```js
function startGame() {
  gameOver = false;
  seconds = 0;
  clearInterval(timerInterval);
  timerInterval = setInterval(tickTimer, 1000);

  // reset game state, build board...

  $('#overlay').classList.remove('show');
}
```

### 6.4 Timer (reuse common.js `formatTime`)

```js
function tickTimer() {
  seconds++;
  $('#timer').textContent = formatTime(seconds);
}
// formatTime(seconds) returns "m:ss" — already in common.js, no import needed
```

### 6.5 endGame(won)

```js
function endGame(won) {
  gameOver = true;
  clearInterval(timerInterval);
  const ts = formatTime(seconds);
  $('#overlayTitle').textContent = won ? '🎉 Solved!' : '😵 Game Over';
  $('#overlayMsg').textContent = `Finished in ${ts}.`;
  $('#overlay').classList.add('show');
}
```

### 6.6 Settings panel wiring

```js
function openSettings() {
  syncSettingsUI();
  syncThemePicker();      // <-- MUST call this — wires theme rows + bg image
  $('#settingsBackdrop').classList.add('show');
  $('#settingsPanel').classList.add('show');
}
function closeSettings() {
  $('#settingsBackdrop').classList.remove('show');
  $('#settingsPanel').classList.remove('show');
}

$('#settingsBtn').addEventListener('click', openSettings);
$('#settingsBackdrop').addEventListener('click', closeSettings);

// convenience helper — mirrors the pattern used by all three existing games
function onToggle(id, key, extra) {
  $('#' + id).addEventListener('change', e => {
    cfg[key] = e.target.checked;
    saveCfg();
    if (extra) extra();
  });
}
onToggle('togMyOption', 'myOption');

function syncSettingsUI() {
  $('#togMyOption').checked = cfg.myOption;
  // ... sync all other controls to current cfg
}

function applySettingsToUI() {
  // push cfg state into visible UI — called at game start and after toggles
}
```

`syncThemePicker()` is defined in `theme.js` and is available globally.
Omitting the call means theme pick-rows won't show which is selected, the
custom themes list won't render, and the bg-image picker won't be wired.

### 6.7 Persist / restore

```js
function saveGameState() {
  pushHistory('mygame-history', {
    ts: Date.now(),
    // snapshot of all game state needed to resume
    gameOver,
    seconds,
    // ...
  });
  // Optional third arg: limit (default 20). For large state, pass 2:
  // pushHistory('mygame-history', snapshot, 2);
}

function restoreMyGame() {
  const history = loadJSON('mygame-history', []);
  if (!history.length) return false;
  const s = history[history.length - 1];
  if (!s || /* sanity check your required fields */) return false;

  // restore all state from s
  gameOver = s.gameOver;
  seconds  = s.seconds || 0;
  // ...

  if (!gameOver) timerInterval = setInterval(tickTimer, 1000);
  // re-render board, update UI...
  return true;
}

// kick off — always this pattern at the bottom of the file
if (!restoreMyGame()) startGame();
```

`pushHistory` keeps a circular buffer in localStorage. It only ever appends;
`restoreMyGame` reads `history[history.length - 1]` (the latest snapshot).
Pass `limit: 2` for games with large board state to keep storage light.

### 6.8 Responsive sizing

Compute `--cell` (and any other dimension vars) from available width:

```js
function updateCellSize() {
  const wrap = document.querySelector('.board-wrap');
  if (!wrap) return;
  const avail = wrap.clientWidth;
  const cell = Math.max(30, Math.floor(avail / numCols));
  document.documentElement.style.setProperty('--cell', cell + 'px');
}
window.addEventListener('resize', updateCellSize);
updateCellSize(); // call before startGame / restoreMyGame
```

---

## 7. Non-covering banner (for loss / soft end states)

When you want the board to stay visible after a game-over (e.g. so the
player can study what happened), use a `.banner` below the board instead
of the `.overlay`. This is the pattern Minesweeper uses for loss and 2048
uses for game-over.

**HTML** — place directly after `.board-wrap`:

```html
<div class="banner" id="banner">
  <div class="banner-left">
    <div class="banner-title" id="bannerTitle">Game Over</div>
    <div class="banner-sub"   id="bannerSub">No moves left</div>
  </div>
  <div class="banner-btns">
    <button class="btn accent" id="bannerBtn">New Game</button>
  </div>
</div>
```

**CSS** — add to your game's CSS (not in `theme.css`):

```css
.banner {
  width: 100%; max-width: 420px;
  margin-top: 12px; background: var(--surface);
  border: 1px solid var(--surface3);
  border-radius: var(--radius); padding: 14px 18px;
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  opacity: 0; pointer-events: none;
  transform: translateY(6px);
  transition: opacity .25s, transform .25s;
}
.banner.show { opacity: 1; pointer-events: all; transform: translateY(0); }
.banner-left  { display: flex; flex-direction: column; gap: 2px; }
.banner-title {
  font-size: 1.2rem; font-weight: 800;
  background: linear-gradient(135deg, var(--accent), var(--accent2));
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  background-clip: text;
}
.banner-sub   { font-size: .8rem; color: var(--text-muted); }
.banner-btns  { display: flex; gap: 8px; flex-shrink: 0; }
```

**JS**:

```js
$('#bannerBtn').addEventListener('click', startGame);

// in endGame:
$('#bannerSub').textContent = `You lost after ${formatTime(seconds)}.`;
$('#banner').classList.add('show');

// in startGame:
$('#banner').classList.remove('show');
```

The two patterns are not mutually exclusive — Minesweeper uses the overlay
for win and the banner for loss.

---

## 8. Wire into `index.html`

Add a `.game-card` entry inside `<nav class="game-list">`:

```html
<a class="game-card" href="mygame.html">
  <span class="emoji">🎯</span>
  <span class="meta">
    <span class="name">My Game</span>
    <span class="desc">One sentence description of the game</span>
  </span>
  <span class="chevron">›</span>
</a>
```

---

## 9. Wire into every existing game page

Add one line to the `#puzzleDropdown` in **every** game page, including your
own. Current pages to update: `index.html` (home card), `2048.html`,
`sudoku.html`, `kakuro.html`, `minesweeper.html`, and your new page.

```html
<a href="mygame.html" class="puzzle-option">🎯 My Game</a>
```

**How the switcher works** — `common.js` runs this automatically once at
page load. It reads `location.pathname.split('/').pop()` to get the current
filename (e.g. `sudoku.html`) and marks the matching `.puzzle-option` with
class `current` (styled as accent-coloured, non-clickable). No JS change
is needed.

---

## 10. localStorage key conventions

| Purpose | Key pattern | Owner |
|---------|-------------|-------|
| Game settings | `<game>-cfg` | Your JS |
| Game history (restore) | `<game>-history` | Your JS via `pushHistory` |
| Game best scores | `<game>-best` | Your JS |
| Active theme | `puzzle-theme` | `theme.js` — do not touch |
| Background image | `puzzle-bg-image` | `theme.js` — do not touch |
| Board opacity | `puzzle-board-alpha` | `theme.js` — do not touch |
| Custom themes | `puzzle-custom-themes` | `theme.js` — do not touch |

Never write to the shared `puzzle-*` keys from your game JS — they're
entirely managed by `theme.js`.

---

## 11. `common.js` utility reference

All of these are global — no import needed.

```js
$(selector)                  // document.querySelector shorthand
$$(selector)                 // Array.from(document.querySelectorAll(...))
$(selector, root)            // scoped querySelector

loadJSON(key, fallback)      // JSON.parse from localStorage, safe
saveJSON(key, value)         // JSON.stringify to localStorage, safe

pushHistory(key, snapshot)         // append to circular buffer (limit 20)
pushHistory(key, snapshot, limit)  // explicit limit, e.g. 2 for large state

shuffle(array)               // Fisher-Yates, returns new array

formatTime(seconds)          // returns "m:ss" string, e.g. "1:05"
```

---

## 12. Settings patterns — reference implementations

### Toggle (checkbox)

```html
<div class="setting-row">
  <div class="setting-info">
    <div class="setting-name">Show timer</div>
    <div class="setting-desc">Display the solve clock.</div>
  </div>
  <label class="toggle">
    <input type="checkbox" id="togTimer" checked>
    <span class="toggle-slider"></span>
  </label>
</div>
```

```js
onToggle('togTimer', 'showTimer', () => {
  // optional callback after state change
  $('#timer').style.display = cfg.showTimer ? '' : 'none';
});
```

### Segmented control (two options)

```html
<div class="seg-control">
  <button class="seg-btn active" id="segEasy">Easy</button>
  <button class="seg-btn" id="segHard">Hard</button>
</div>
```

```js
$('#segEasy').addEventListener('click', () => {
  cfg.mode = 'easy';
  saveCfg();
  syncSettingsUI();
});
$('#segHard').addEventListener('click', () => {
  cfg.mode = 'hard';
  saveCfg();
  syncSettingsUI();
});

// in syncSettingsUI:
$('#segEasy').classList.toggle('active', cfg.mode === 'easy');
$('#segHard').classList.toggle('active', cfg.mode === 'hard');
```

### Option chip row (three or more options, e.g. strike limit)

```html
<div class="strike-picker" id="myPicker">
  <div class="strike-opt" data-val="3">3</div>
  <div class="strike-opt" data-val="5">5</div>
  <div class="strike-opt" data-val="0">Unlimited</div>
</div>
```

```js
$$('#myPicker .strike-opt').forEach(opt => {
  opt.addEventListener('click', () => {
    cfg.myVal = +opt.dataset.val;
    saveCfg();
    syncSettingsUI();
  });
});

// in syncSettingsUI:
$$('#myPicker .strike-opt').forEach(opt => {
  opt.classList.toggle('active', +opt.dataset.val === cfg.myVal);
});
```

### Dimming a settings row when a toggle disables it

```js
function applySettingsToUI() {
  const active = cfg.longPressFlag;
  $('#mySubRow').style.opacity = active ? '1' : '0.4';
  $('#myPicker').style.opacity = active ? '1' : '0.4';
  $('#myPicker').style.pointerEvents = active ? 'auto' : 'none';
}
```

---

## 13. Jekyll / GitHub Pages

The repository is served by GitHub Pages via Jekyll. Files in `plans/`
contain code snippets with `{{ ... }}` that Liquid (Jekyll's template engine)
tries to evaluate and errors on.

`_config.yml` at the repo root fixes this:

```yaml
exclude:
  - plans
```

**When you add new markdown files** that contain any `{{` or `}}`:
- If they're in `plans/`, they're already excluded — no action needed.
- If you add a markdown file elsewhere (e.g. at the repo root), wrap code
  blocks containing those characters in `{% raw %}...{% endraw %}` tags, or
  add the file path to the `exclude:` list in `_config.yml`.

---

## 14. FAQ

**Q: My page loads but the header/buttons are unstyled.**
The shared layout classes (`.header`, `.btn`, `.board-top-bar`, etc.) are not
in `theme.css`. Copy the shared layout block from `sudoku.css` into your
game's CSS (see §4).

**Q: The theme picker opens but shows no checkmarks / custom themes.**
You're not calling `syncThemePicker()` inside `openSettings()`. Add it — it
must be called every time the panel opens, not just once on load.

**Q: Switching puzzle via the dropdown doesn't highlight the current game.**
`common.js` compares each `.puzzle-option`'s `href` to the current page
filename. Make sure the `href` matches exactly — e.g. `href="mygame.html"`,
not `href="./mygame.html"` or `href="/mygame.html"`.

**Q: The board-opacity slider does nothing on my board.**
You're using a plain `background:` colour rather than `color-mix`. Replace:
```css
/* before */
.board { background: var(--surface3); }
/* after */
.board { background: color-mix(in srgb, var(--surface3) var(--board-alpha), transparent); }
```
Apply the same fix to every cell/surface colour inside the board.

**Q: The background image doesn't show through my board.**
Same issue as above — use `color-mix` with `--board-alpha` on board surfaces
so they become transparent when the slider is turned down.

**Q: Restore on page reload doesn't work.**
`restoreMyGame()` must return `false` (not `undefined`) when there's nothing
to restore. Check that your sanity check on the loaded snapshot explicitly
`return false`. Also confirm `saveGameState()` is called after every state
change (after each move, flag, timer tick where you want to capture).

**Q: Settings changes don't persist after reload.**
You forgot `saveCfg()` inside a toggle handler, or you mutated `cfg` directly
without calling `saveCfg()`. Every toggle/picker handler must call `saveCfg()`
after updating `cfg`.

**Q: Right-click opens the browser context menu on desktop.**
Your `contextmenu` listener needs `e.preventDefault()`. Scope it to the board
element only (not `document`) so the rest of the page still has a native menu:
```js
$('#board').addEventListener('contextmenu', e => {
  e.preventDefault();
  // handle right-click...
});
```

**Q: Long-press on touch fires the action twice.**
The browser also fires a native `contextmenu` on long-press touch. Track
`lastPointerType` on `pointerdown` and skip the `contextmenu` handler when
`lastPointerType !== 'mouse'`. See `minesweeper.js` for the full pattern.

**Q: The Jekyll Pages build fails with a Liquid error.**
A markdown file outside `plans/` contains `{{` or `}}`. Wrap the offending
block in `{% raw %}...{% endraw %}` or add the file to `exclude:` in
`_config.yml`.

**Q: Where does `.pick-row-link` / `.pick-arrow` live?**
In `theme-builder.css` — the third `<link>` tag in `<head>`. If the "Build a
theme ›" row is unstyled, check that `theme-builder.css` is linked.

**Q: Where does `.toast` live?**
Also `theme-builder.css`. The `kakuro.css` has its own toast implementation
in addition; if you need toast-style notifications, copy the CSS from
`kakuro.css` lines 309–321.
