# Theming Engine — Implementation Spec

## Project context

Three-game puzzle suite served from GitHub Pages on branch
`claude/puzzle-games-unified-ui-da8djp` at `mattcam2007.github.io`.

Games:
- `2048.html` / `js/2048.js` / `css/2048.css`
- `sudoku.html` / `js/sudoku.js` / `css/sudoku.css`
- `kakuro.html` / `js/kakuro.js` / `css/kakuro.css`

All three HTML files load in this order:
1. `css/theme.css` — shared tokens, reset, shared components
2. `css/<game>.css` — game-specific styles
3. `js/common.js` — shared JS utilities (`$`, `$$`, `saveJSON`, `loadJSON`)
4. `js/<game>.js` — game logic

## What is already built (do not redo this work)

- **`css/theme.css`** owns all `:root` design tokens. After the final prep
  pass it includes `--accent-rgb`, `--accent2-rgb`, `--bg-image`, and the
  full `.settings-backdrop`/`.settings-panel` component tree.
- **`.pick-row` / `.pick-icon` / `.pick-check`** are in `theme.css` —
  the styled list-item component used in settings pickers. All three games
  can use it.
- **`css/2048.css`** has `.tile-v2` … `.tile-vmax` colour classes. Tile
  appearance in 2048 is driven entirely by these classes (not inline
  styles), so themes can override them.
- **`css/sudoku.css`** highlight variables (`--highlight-box` etc.) derive
  from `rgba(var(--accent-rgb), …)` — they automatically follow the accent.
- **`css/kakuro.css`** `--run-glow` and selection overlay similarly derive
  from `--accent-rgb`.
- Every game has a working settings panel: gear icon → bottom-sheet.
  Sudoku and kakuro open it via `#settingsBtn` / `#settingsBackdrop`.
  2048 opens it via `openSettings()` / `closeSettings()`.

## Goal

Add a theme switcher so players can switch the visual skin of the entire
app. The switch persists across all three games via `localStorage`. Themes
are pure CSS — zero JS game logic changes.

## The complete theme token set

A theme is exactly these 15 `:root` variable overrides. Nothing else.

### Colour tokens (11)

| Token           | Void (default)    | Role                                          |
|-----------------|-------------------|-----------------------------------------------|
| `--bg`          | `#0f0f13`         | Page background colour                        |
| `--surface`     | `#1a1a24`         | Cards, panels, board background               |
| `--surface2`    | `#22222f`         | Nested surfaces (settings section bg)         |
| `--surface3`    | `#2a2a3a`         | Borders, dividers, inactive button borders    |
| `--cell-empty`  | `#1e1e2a`         | Empty board cells                             |
| `--accent`      | `#7c6af7`         | Primary accent: selected states, btn accent   |
| `--accent2`     | `#c084fc`         | Secondary accent: gradient end, text on accent|
| `--accent-rgb`  | `124, 106, 247`   | RGB triplet of `--accent` (used in `rgba()`)  |
| `--accent2-rgb` | `192, 132, 252`   | RGB triplet of `--accent2`                    |
| `--text`        | `#e8e6f0`         | Primary text                                  |
| `--text-muted`  | `#6b6880`         | Labels, placeholder, secondary text           |

`--text-dim`, `--error`, `--success`, `--warn`, `--cyan` stay fixed across
all themes. Do not make them theme-variable.

### Shape tokens (2)

| Token         | Void value | Effect                                              |
|---------------|------------|-----------------------------------------------------|
| `--radius`    | `10px`     | Board / card rounding                               |
| `--radius-sm` | `6px`      | Button rounding — set to `999px` for pill buttons   |

### Background extension (1)

| Token        | Default | Effect                                             |
|--------------|---------|----------------------------------------------------|
| `--bg-image` | `none`  | `background-image` on `<body>` — supports any CSS  |
|              |         | gradient or `url(…)`. `--bg` acts as colour fallback |

The body rule in `theme.css` is already:
```css
body {
  background-color: var(--bg);
  background-image: var(--bg-image);
  background-size: cover;
  background-attachment: fixed;
  …
}
```

### 2048 tile colours (per-theme override in `css/2048.css`)

The default `.tile-v2` … `.tile-vmax` classes are already in `css/2048.css`
(purple gradient). Each non-Void theme needs its own `[data-theme="X"]`
block in `css/2048.css` overriding all 12 of these classes.

## Architecture

Themes are CSS attribute overrides scoped to `html[data-theme="X"]`:

```css
/* css/theme.css */
html[data-theme="midnight"] {
  --bg:          #07090f;
  --surface:     #0d1220;
  /* … all 15 tokens … */
}
```

A new file `js/theme.js` manages the `data-theme` attribute and picker UI.
It must load **before** each game's JS. Add a `<script>` tag to each HTML:

```html
<script src="js/common.js"></script>
<script src="js/theme.js"></script>   <!-- ADD THIS LINE to all 3 HTMLs -->
<script src="js/<game>.js"></script>
```

## `js/theme.js` — full implementation spec

Create this file from scratch. It must:

1. Define `THEMES` — ordered array of theme descriptors.
2. Export `applyTheme(id)` — sets `data-theme` on `<html>`, saves to
   `localStorage` under the key `'puzzle-theme'`.
3. Call `loadTheme()` immediately on script load — reads `localStorage` and
   applies the saved theme (or `'void'` if none).
4. Expose `syncThemePicker()` — marks the correct pick-row as `.selected`
   and wires `onclick` handlers. Call this once when the settings panel
   opens in each game.

```js
const THEMES = [
  { id: 'void',     icon: '🌑', label: 'Void'     },
  { id: 'midnight', icon: '🌊', label: 'Midnight'  },
  { id: 'sakura',   icon: '🌸', label: 'Sakura'    },
  { id: 'terminal', icon: '💻', label: 'Terminal'  },
];

function applyTheme(id) {
  document.documentElement.setAttribute('data-theme', id);
  localStorage.setItem('puzzle-theme', id);
  syncThemePicker();
}

function loadTheme() {
  const saved = localStorage.getItem('puzzle-theme') || 'void';
  document.documentElement.setAttribute('data-theme', saved);
}

function syncThemePicker() {
  const current = document.documentElement.getAttribute('data-theme') || 'void';
  document.querySelectorAll('[data-theme-pick]').forEach(row => {
    const active = row.dataset.themePick === current;
    row.classList.toggle('selected', active);
    row.onclick = () => applyTheme(row.dataset.themePick);
  });
}

loadTheme();
```

`syncThemePicker` is safe to call at any time; if no picker rows exist it
is a no-op. This means it can simply be called from each game's
`openSettings()` without any per-game conditional logic.

## Settings panel HTML changes (identical for all 3 games)

Add this block as the **first** `<div class="settings-section">` inside
each game's `#settingsPanel`. It must come before any game-specific
settings sections.

```html
<div class="settings-section">
  <div class="settings-section-label">Appearance</div>
  <div class="pick-row" data-theme-pick="void">
    <span class="pick-icon">🌑</span>Void<span class="pick-check">✓</span>
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
</div>
```

## JS wiring per game (minimal, identical pattern)

In each game's `openSettings()` function (or equivalent), add one call:

```js
syncThemePicker();
```

- **2048** (`js/2048.js`): add to `openSettings()` — that function already
  exists.
- **Sudoku** (`js/sudoku.js`): find the settings open handler (the click
  handler for `#settingsBtn`) and add `syncThemePicker()`.
- **Kakuro** (`js/kakuro.js`): same pattern as sudoku.

## The four themes — colour values

### 1. Void (default — already in `:root`, no override block needed)

Dark purple/indigo. Current token values. No CSS change required.

### 2. Midnight

Deep navy/blue, sky-blue accent. Cooler and darker than Void.

```css
html[data-theme="midnight"] {
  --bg:          #07090f;
  --surface:     #0d1220;
  --surface2:    #131a2e;
  --surface3:    #1c2640;
  --cell-empty:  #0f1828;
  --accent:      #38bdf8;
  --accent2:     #7dd3fc;
  --accent-rgb:  56, 189, 248;
  --accent2-rgb: 125, 211, 252;
  --text:        #e2f0ff;
  --text-muted:  #44607e;
  --radius-sm:   6px;
}
```

Tile gradient (add to `css/2048.css`):
```css
html[data-theme="midnight"] .tile-v2    { background: #0d1e38; color: #5a8ab8; }
html[data-theme="midnight"] .tile-v4    { background: #0f2548; color: #7aaad8; }
html[data-theme="midnight"] .tile-v8    { background: #113060; color: #9ac8f0; }
html[data-theme="midnight"] .tile-v16   { background: #133c7a; color: #b8deff; }
html[data-theme="midnight"] .tile-v32   { background: #154896; color: #c8eaff; }
html[data-theme="midnight"] .tile-v64   { background: #1756b0; color: #fff;    }
html[data-theme="midnight"] .tile-v128  { background: #1a68cc; color: #fff;    }
html[data-theme="midnight"] .tile-v256  { background: #1e7ce0; color: #fff;    }
html[data-theme="midnight"] .tile-v512  { background: #2292f0; color: #fff;    }
html[data-theme="midnight"] .tile-v1024 { background: #2aaaf8; color: #07090f; }
html[data-theme="midnight"] .tile-v2048 { background: #38bdf8; color: #07090f; }
html[data-theme="midnight"] .tile-vmax  { background: #38bdf8; color: #07090f; }
```

### 3. Sakura

Warm light theme. Cream/blush background, rose-pink accent. This is the
only light theme and requires the most overrides.

```css
html[data-theme="sakura"] {
  --bg:          #fdf4f5;
  --surface:     #fff7f8;
  --surface2:    #fce8ec;
  --surface3:    #f0cdd4;
  --cell-empty:  #f8eaed;
  --accent:      #e0527a;
  --accent2:     #f472b6;
  --accent-rgb:  224, 82, 122;
  --accent2-rgb: 244, 114, 182;
  --text:        #2d1820;
  --text-muted:  #9a6070;
  --radius-sm:   8px;
}
```

Kakuro has a dark board by default (`--block: #14141c`, `--white: #e8e6f0`).
For Sakura, override in `css/kakuro.css`:
```css
html[data-theme="sakura"] {
  --block:    #e8d0d8;
  --clue:     #f0dce2;
  --white:    #fff7f8;
  --white-ink: #2d1820;
}
```

Tile gradient for Sakura:
```css
html[data-theme="sakura"] .tile-v2    { background: #fce8ee; color: #c06080; }
html[data-theme="sakura"] .tile-v4    { background: #f9d0dc; color: #a04060; }
html[data-theme="sakura"] .tile-v8    { background: #f5b0c4; color: #802040; }
html[data-theme="sakura"] .tile-v16   { background: #f090ac; color: #fff;    }
html[data-theme="sakura"] .tile-v32   { background: #e87098; color: #fff;    }
html[data-theme="sakura"] .tile-v64   { background: #e05080; color: #fff;    }
html[data-theme="sakura"] .tile-v128  { background: #d83068; color: #fff;    }
html[data-theme="sakura"] .tile-v256  { background: #c81850; color: #fff;    }
html[data-theme="sakura"] .tile-v512  { background: #b80040; color: #fff;    }
html[data-theme="sakura"] .tile-v1024 { background: #e8527a; color: #fff;    }
html[data-theme="sakura"] .tile-v2048 { background: #f472b6; color: #fff;    }
html[data-theme="sakura"] .tile-vmax  { background: #f472b6; color: #fff;    }
```

Sudoku's `--given` and `--pencil` will need overrides for Sakura since they
are light lavenders that won't read on a light background. Add to
`css/sudoku.css`:
```css
html[data-theme="sakura"] {
  --given:  #b06070;
  --pencil: #e0527a;
}
```

### 4. Terminal

Near-black with green/lime accent. Hacker aesthetic. Pill-shaped buttons.

```css
html[data-theme="terminal"] {
  --bg:          #020804;
  --surface:     #080f08;
  --surface2:    #0d180d;
  --surface3:    #162416;
  --cell-empty:  #0a120a;
  --accent:      #39d353;
  --accent2:     #85e89d;
  --accent-rgb:  57, 211, 83;
  --accent2-rgb: 133, 232, 157;
  --text:        #c8ffca;
  --text-muted:  #3a6b3a;
  --radius-sm:   999px;
}
```

Tile gradient:
```css
html[data-theme="terminal"] .tile-v2    { background: #041408; color: #2a6b30; }
html[data-theme="terminal"] .tile-v4    { background: #061c0a; color: #3a8b40; }
html[data-theme="terminal"] .tile-v8    { background: #082810; color: #4aab50; }
html[data-theme="terminal"] .tile-v16   { background: #0a3414; color: #5ac860; }
html[data-theme="terminal"] .tile-v32   { background: #0d4018; color: #6adb70; }
html[data-theme="terminal"] .tile-v64   { background: #104e1c; color: #85e89d; }
html[data-theme="terminal"] .tile-v128  { background: #145e22; color: #a0f0a8; }
html[data-theme="terminal"] .tile-v256  { background: #1a7028; color: #c8ffd0; }
html[data-theme="terminal"] .tile-v512  { background: #208530; color: #fff;    }
html[data-theme="terminal"] .tile-v1024 { background: #28a03a; color: #020804; }
html[data-theme="terminal"] .tile-v2048 { background: #39d353; color: #020804; }
html[data-theme="terminal"] .tile-vmax  { background: #39d353; color: #020804; }
```

## Files to create or modify

| File                  | Action                                                      |
|-----------------------|-------------------------------------------------------------|
| `js/theme.js`         | **Create** — full content above                             |
| `css/theme.css`       | **Add** 3 `html[data-theme]` override blocks                |
| `css/2048.css`        | **Add** 3 × 12 tile colour override blocks                  |
| `css/kakuro.css`      | **Add** Sakura board colour override block                  |
| `css/sudoku.css`      | **Add** Sakura `--given`/`--pencil` override block          |
| `2048.html`           | **Add** `<script src="js/theme.js">`, Appearance section    |
| `sudoku.html`         | **Add** `<script src="js/theme.js">`, Appearance section    |
| `kakuro.html`         | **Add** `<script src="js/theme.js">`, Appearance section    |
| `js/2048.js`          | **Edit** `openSettings()` — add `syncThemePicker()`         |
| `js/sudoku.js`        | **Edit** settings open handler — add `syncThemePicker()`    |
| `js/kakuro.js`        | **Edit** settings open handler — add `syncThemePicker()`    |

## What NOT to touch

- Any game logic (board generation, move handling, scoring, win/loss)
- Animation/particle system in `js/2048.js`
- Board layout, grid sizing, or cell geometry CSS
- `--error`, `--success`, `--warn`, `--cyan` token values
- `TILE_COLORS` in `js/2048.js` — it drives particle effect colours, not
  rendered tile appearance; leave it as-is

## Definition of done

- Switching theme in any game immediately updates all three games on next
  visit (localStorage persists the choice)
- The default Void theme looks identical to the current app — pixel-perfect,
  no regressions
- Sakura (light theme) has readable contrast on all text, buttons, and board
  cells across all three games
- Terminal pill buttons (`--radius-sm: 999px`) are visible and consistent
  across all three games without any layout breakage
- No JS game logic files are modified except the three `openSettings` / 
  settings-open handler additions
