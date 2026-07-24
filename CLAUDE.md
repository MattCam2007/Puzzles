# Puzzles — Developer Reference

Static HTML/CSS/JS puzzle suite (2048, Sudoku, Kakuro, Minesweeper) served via GitHub Pages.
No build step, no bundler, no framework.

## Project layout

```
Puzzles/
├── index.html                ← home / game picker
├── <game>.html               ← one per game (2048, sudoku, kakuro, minesweeper)
├── theme-builder.html        ← custom theme editor
├── css/
│   ├── theme.css             ← ALL design tokens + shared chrome (settings panel, switcher)
│   ├── theme-builder.css     ← pick-row-link / pick-arrow styles (must be third <link>)
│   ├── index.css             ← home page only
│   └── <game>.css            ← layout classes + game-specific styles
├── js/
│   ├── common.js             ← $, $$, loadJSON, saveJSON, pushHistory, shuffle, formatTime
│   ├── theme.js              ← applyTheme, loadTheme, syncThemePicker, bg image, board alpha
│   ├── theme-builder.js      ← custom theme editor UI
│   ├── logic-engine.js       ← Logic Grid generation/solving (pure, DOM-free, Node-testable)
│   ├── logic-packs.js        ← Logic Grid story packs (data; templated prose contract)
│   ├── freeflow-engine.js    ← Free Flow generation + solver (pure, DOM-free, Node-testable)
│   └── <game>.js             ← complete game logic / UI layer
├── data/                     ← word lists and other data files (add here)
├── tests/                    ← Node test suites (no deps; excluded from GitHub Pages)
└── plans/                    ← internal planning docs (excluded from GitHub Pages by _config.yml)
```

Every game HTML loads scripts in this order: `common.js` → `theme.js` → `<game>.js`
(Logic Grid inserts `logic-packs.js` → `logic-engine.js` before `logic.js`;
Free Flow inserts `freeflow-engine.js` before `freeflow.js`).

## Local development

```bash
python3 -m http.server 8000   # or: npx http-server
# open http://localhost:8000
```

No install, no build. Edit files and reload.

Tests (plain Node, no dependencies):

```bash
node tests/logic-engine.test.js   # Logic Grid engine: validity, no-guessing, packs
node tests/freeflow-engine.test.js # Free Flow engine: partition validity, solver, unique solutions
node tests/smoke.test.js          # headless-browser smoke suite: boots every game, checks settings/theme/reload
```

## localStorage key conventions

| Prefix        | Owner      | Description                                     |
|---------------|------------|-------------------------------------------------|
| `puzzle-*`    | `theme.js` | Theme, bg image, board alpha, custom themes     |
| `<game>-cfg`  | game JS    | User settings (difficulty, toggles, etc.)       |
| `<game>-history` | game JS | State snapshots for restore-on-reload          |
| `<game>-best` | game JS    | Best scores                                     |

Never write `puzzle-*` keys from game JS — they are managed exclusively by `theme.js`.

---

## Common processes

---

### Adding a built-in theme

A theme is exactly 15 CSS custom-property overrides scoped to `html[data-theme="id"]`. Nothing else.

**Step 1 — Pick an id, icon, and label**

Keep the id lowercase alphanumeric (e.g. `forest`). Pick an emoji icon.

**Step 2 — Add the CSS token block to `css/theme.css`**

Append after the existing `html[data-theme="terminal"]` block (line 92):

```css
html[data-theme="forest"] {
  /* surfaces */
  --bg:          #08120a;
  --surface:     #0f1f12;
  --surface2:    #162a1a;
  --surface3:    #1e3824;
  --cell-empty:  #0d1a10;
  /* accents */
  --accent:      #4caf50;
  --accent2:     #81c784;
  --accent-rgb:  76, 175, 80;
  --accent2-rgb: 129, 199, 132;
  /* text */
  --text:        #d8f0da;
  --text-muted:  #4a7a4e;
  /* shape */
  --radius-sm:   6px;
}
```

Required tokens: `--bg`, `--surface`, `--surface2`, `--surface3`, `--cell-empty`,
`--accent`, `--accent2`, `--accent-rgb`, `--accent2-rgb`, `--text`, `--text-muted`,
`--radius-sm`. Optional override: `--radius`.

Do not touch: `--text-dim`, `--error`, `--success`, `--warn`, `--cyan` — these are fixed across all themes.
Do not set `--bg-image` or `--board-alpha` — these are user-controlled at runtime.

**Step 3 — Add to the THEMES array in `js/theme.js`**

```js
const THEMES = [
  { id: 'galaxy',   icon: '🌌', label: 'Galaxy'   },
  { id: 'midnight', icon: '🌊', label: 'Midnight' },
  { id: 'sakura',   icon: '🌸', label: 'Sakura'   },
  { id: 'terminal', icon: '💻', label: 'Terminal' },
  { id: 'forest',   icon: '🌲', label: 'Forest'   },  // ← add here
];
```

**Step 4 — Add a pick-row to every game's settings panel HTML**

In each of `2048.html`, `sudoku.html`, `kakuro.html`, `minesweeper.html`,
find the Appearance `settings-section` and add:

```html
<div class="pick-row" data-theme-pick="forest">
  <span class="pick-icon">🌲</span>Forest<span class="pick-check">✓</span>
</div>
```

**Step 5 — Add 2048 tile colour overrides to `css/2048.css`**

Tile colours are not derived from tokens. Add 12 overrides:

```css
html[data-theme="forest"] .tile-v2    { background: #0d2210; color: #2a6b30; }
html[data-theme="forest"] .tile-v4    { background: #102a14; color: #3a8b40; }
html[data-theme="forest"] .tile-v8    { background: #14381a; color: #4aab50; }
html[data-theme="forest"] .tile-v16   { background: #184820; color: #5ac860; }
html[data-theme="forest"] .tile-v32   { background: #1d5826; color: #6adb70; }
html[data-theme="forest"] .tile-v64   { background: #22682e; color: #85e89d; }
html[data-theme="forest"] .tile-v128  { background: #287a36; color: #a0f0a8; }
html[data-theme="forest"] .tile-v256  { background: #2e8e40; color: #c8ffd0; }
html[data-theme="forest"] .tile-v512  { background: #36a44a; color: #fff;    }
html[data-theme="forest"] .tile-v1024 { background: #3eba55; color: #08120a; }
html[data-theme="forest"] .tile-v2048 { background: #4caf50; color: #08120a; }
html[data-theme="forest"] .tile-vmax  { background: #4caf50; color: #08120a; }
```

**Step 6 — Add per-game overrides for light themes only**

Skip this step for dark themes. For a light theme (like Sakura), some game-specific
colours need overrides:

- `css/sudoku.css`: override `--given` and `--pencil` so text is readable on light bg
- `css/kakuro.css`: override `--block`, `--clue`, `--white`, `--white-ink`

See `html[data-theme="sakura"]` blocks in those files as reference.

**Step 7 — Test**

Switch themes in every game. Check:
- All text is readable
- Board cells and tiles have visible contrast
- Settings panel rows show the tick on the active theme
- Reloading a page restores the selected theme

---

### Adding a word dictionary

The suite currently has no word-list games. This is the pattern to follow when
adding one (e.g. Wordle, Word Search, Crossword).

**Data format**

Store word lists as plain JSON arrays in `data/dictionaries/`:

```
data/
└── dictionaries/
    ├── en.json      ← ["about", "above", "abuse", ...]  (sorted, lowercase)
    └── fr.json      ← ["abord", "abris", ...]
```

Each file is a JSON array of strings, sorted alphabetically, all lowercase.
Keep answer words and valid-guess words in separate files if needed:

```
data/dictionaries/en-answers.json    ← words that can be the answer (~2000)
data/dictionaries/en-valid.json      ← extended list for guess validation (~10000)
```

**Loading the dictionary in game JS**

Fetch on game init; cache on the module-level variable so it is only fetched once.

```js
const DEFAULTS = { language: 'en', /* ... */ };
let cfg = Object.assign({}, DEFAULTS, loadJSON('wordgame-cfg', {}));

let dictionary = null;

async function loadDictionary() {
  if (dictionary) return;
  const res = await fetch(`data/dictionaries/${cfg.language}.json`);
  dictionary = await res.json();
}

async function startGame() {
  await loadDictionary();
  const answer = dictionary[Math.floor(Math.random() * dictionary.length)];
  // ...
}
```

**Language preference**

Store the active language in `cfg` (persisted via `saveJSON`), not in the
`puzzle-*` namespace. Add a setting toggle or segmented control to switch it.

**Validation**

```js
function isValidWord(word) {
  return dictionary.includes(word.toLowerCase());
}
```

For large dictionaries (>50k words), convert to a `Set` after loading:

```js
let dictionarySet = null;

async function loadDictionary() {
  if (dictionarySet) return;
  const res = await fetch(`data/dictionaries/${cfg.language}.json`);
  dictionarySet = new Set(await res.json());
}

function isValidWord(word) {
  return dictionarySet.has(word.toLowerCase());
}
```

**Bundling vs. fetch**

For small word lists (<500 words) you can inline them as a JS constant in
`js/<game>.js` to avoid a network round-trip. For anything larger, use fetch.

---

### Adding a new game

See `plans/adding-a-game.md` for the full reference (888 lines, verified against live code).

Quick checklist:

1. Create `<game>.html` from the template in §3 of the guide
2. Create `css/<game>.css` — copy the shared layout block from `css/sudoku.css` or `css/kakuro.css` first
3. Create `js/<game>.js` using the structure below
4. Add a `.game-card` to `index.html`
5. Add a `.puzzle-option` entry to the `#puzzleDropdown` in **every** game's HTML (including the new one)

**Required game HTML ids** (used by shared scripts):

`puzzleSwitcherBtn`, `puzzleDropdown`, `.puzzle-option`, `settingsBackdrop`,
`settingsPanel`, `customThemesList`, `bgUploadRow`, `bgImageFile`, `bgImageUrl`,
`clearBgBtn`, `boardAlphaSlider`, `[data-theme-pick]`

**JS module skeleton:**

```js
const DEFAULTS = { difficulty: 'medium' /* + all user-facing settings */ };
let cfg = Object.assign({}, DEFAULTS, loadJSON('<game>-cfg', {}));
function saveCfg() { saveJSON('<game>-cfg', cfg); }

function startGame() { /* reset state, generate puzzle, render */ }
function endGame(won) { /* fill overlay, show */ }

function openSettings() {
  syncSettingsUI();
  syncThemePicker();                          // always call this
  $('#settingsBackdrop').classList.add('show');
  $('#settingsPanel').classList.add('show');
}
function closeSettings() {
  $('#settingsBackdrop').classList.remove('show');
  $('#settingsPanel').classList.remove('show');
}

function syncSettingsUI() {
  // mirror cfg → UI controls
}

function onToggle(id, key, extra) {
  $('#' + id).addEventListener('change', e => {
    cfg[key] = e.target.checked;
    saveCfg();
    if (extra) extra();
  });
}

$('#settingsBtn').addEventListener('click', openSettings);
$('#settingsBackdrop').addEventListener('click', closeSettings);
$('#newGameBtn').addEventListener('click', startGame);

// Persist + restore on reload
function saveGameState() {
  pushHistory('<game>-history', { /* all state fields */ });
}
function restoreGameState() {
  const h = loadJSON('<game>-history', []);
  if (!h.length) return false;
  const s = h[h.length - 1];
  /* restore fields */ 
  return true;
}

if (!restoreGameState()) startGame();
```

**Board transparency** — use `color-mix` so the opacity slider works:

```css
.board {
  background: color-mix(in srgb, var(--surface3) var(--board-alpha), transparent);
}
```

---

### Adding a difficulty level

Add an entry to the game's `LEVELS` constant and a matching `<option>` in the HTML `<select>`.

```js
// js/<game>.js
const LEVELS = {
  easy:   { /* params */ },
  medium: { /* params */ },
  hard:   { /* params */ },
  expert: { /* params */ },   // ← new level
};

const DEFAULTS = { difficulty: 'medium' };
```

```html
<!-- <game>.html -->
<select id="difficultySelect">
  <option value="easy">Easy</option>
  <option value="medium">Medium</option>
  <option value="hard">Hard</option>
  <option value="expert">Expert</option>   <!-- new -->
</select>
```

Persist the selection in `cfg.difficulty` via `saveCfg()`.

---

### Adding a setting toggle

**HTML** (inside a `settings-section` in `<game>.html`):

```html
<div class="setting-row">
  <div class="setting-info">
    <div class="setting-name">My Option</div>
    <div class="setting-desc">Brief description shown under the name.</div>
  </div>
  <label class="toggle">
    <input type="checkbox" id="togMyOption">
    <span class="toggle-slider"></span>
  </label>
</div>
```

**JS:**

```js
const DEFAULTS = { myOption: true };

// wire in the script init block:
onToggle('togMyOption', 'myOption', () => {
  // optional: immediately apply the change to the live UI
  applyMyOption();
});

// in syncSettingsUI():
$('#togMyOption').checked = cfg.myOption;
```

---

### Shared utility reference (`js/common.js`)

| Function | Signature | Purpose |
|---|---|---|
| `$` | `(sel, root?)` | `querySelector` shorthand |
| `$$` | `(sel, root?)` | `querySelectorAll` → Array |
| `loadJSON` | `(key, fallback)` | Read + parse localStorage |
| `saveJSON` | `(key, value)` | Stringify + write localStorage |
| `pushHistory` | `(key, snapshot, limit=20)` | Append to circular snapshot buffer |
| `shuffle` | `(arr)` | Fisher-Yates shuffle (returns new array) |
| `formatTime` | `(seconds)` | `"m:ss"` string |

The puzzle-switcher dropdown is wired automatically by `common.js` on page load —
no per-game code needed.

---

### Theme system reference (`js/theme.js`)

| Function | Purpose |
|---|---|
| `applyTheme(id)` | Set `data-theme` on `<html>`, save to `puzzle-theme` in localStorage |
| `loadTheme()` | Called at script init — restores saved theme |
| `syncThemePicker()` | Mark active pick-rows `.selected`, wire `onclick`. Call from `openSettings()` |
| `applyBgImage(url\|null)` | Set/clear `--bg-image` CSS property and `puzzle-bg-image` in localStorage |
| `applyBoardAlpha(0-100)` | Set `--board-alpha` CSS property and `puzzle-board-alpha` in localStorage |

Custom themes (from the theme builder) are stored in `puzzle-custom-themes` as a
JSON array. `syncThemePicker()` automatically renders them in `#customThemesList`.
