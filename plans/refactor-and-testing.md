# Refactor & Testing Plan — Premium Puzzle Suite

## 1. Project context

A three-game puzzle suite (2048, Sudoku, Kakuro) plus a Theme Builder,
served as static files from GitHub Pages. No build step, no package
manager, no tests. All JS is classic `<script>` globals loaded in order:

```html
<script src="js/common.js"></script>   <!-- $, $$, loadJSON, saveJSON, formatTime, pushHistory, shuffle, puzzle switcher -->
<script src="js/theme.js"></script>    <!-- theme tokens, custom themes, bg image, board alpha, picker sync -->
<script src="js/<game>.js"></script>   <!-- everything else: engine + state + rendering + input + settings, one file each -->
```

| File                  | Lines | Contents                                                              |
|-----------------------|-------|-----------------------------------------------------------------------|
| `js/2048.js`          | 797   | Tile modes, anim picker, canvas particle system, engine, DOM, input   |
| `js/kakuro.js`        | 702   | Full generator/solver IIFE (`K`) + controller/UI in one file          |
| `js/sudoku.js`        | 618   | Generator/solver + state + rendering + settings + keyboard            |
| `js/theme-builder.js` | 704   | Token editors, saved themes, import/export, preview carousel          |
| `js/theme.js`         | 188   | Built-in + custom themes, bg image, alpha, picker wiring              |
| `js/common.js`        | 66    | DOM/localStorage/time/array helpers + puzzle-switcher IIFE            |

The code works, but it is a set of four hand-grown monoliths sharing a
copy-paste culture. To make this a premium product we need: a module
architecture, a pure (DOM-free) engine layer we can unit-test, shared UI
components instead of four copies of the same markup/wiring, and a test
suite + CI that keeps it bug-free as it grows.

## 2. Goals and non-goals

**Goals**

1. **Behaviour-preserving refactor.** Every feature, setting, keyboard
   shortcut, animation and localStorage save continues to work exactly as
   today. Saved games and themes from the current version must restore in
   the refactored version (same storage keys, same shapes).
2. **Clean / DRY / modular.** One source of truth for every helper,
   component and style. Pure game engines with zero DOM access.
3. **Tested.** Unit tests for every engine and utility, DOM tests for the
   shared UI layer, CI that runs them on every push.
4. **Still zero-build.** GitHub Pages serves files as-is. We use native ES
   modules (`<script type="module">`), which every browser we care about
   supports. npm/devDependencies exist only for tests and lint — nothing
   is compiled or bundled for production.

**Non-goals (explicitly out of scope for the refactor)**

- No framework (React/Vue/etc.). The vanilla approach is a feature here.
- No TypeScript migration (we get 80% of the value from JSDoc + checkJs,
  see §9 recommendations).
- No visual redesign. Pixel-identical output is the success criterion.
- No new features inside refactor PRs. Upgrades land separately (§9).

## 3. Why refactor first, and how we stay safe

The user-facing order is "refactor, then tests" — but a refactor with no
safety net on 3,000 lines of game logic is how bugs get introduced. The
resolution: **each refactor phase lands together with characterization
tests for the code it extracts.** Extracting an engine into a pure module
is precisely what makes it testable; the tests written in the same PR
prove the extraction didn't change behaviour. The big test-suite expansion
(§8) then builds on clean modules, as requested.

Safety mechanisms used throughout:

- **Pure-function extraction**: engines move verbatim first ("lift and
  shift"), then get cleaned in a separate commit, so diffs stay reviewable.
- **Seeded RNG injection**: all randomness goes through one injectable
  generator (`core/random.js`), so "generate a puzzle" becomes
  deterministic and assertable. Kakuro already does this internally
  (`rng(seed)` in `js/kakuro.js:5`) — we generalize the pattern.
- **Golden snapshots**: for a fixed seed, the generated Sudoku/Kakuro
  boards and a scripted 2048 move sequence are snapshotted before the
  refactor and must match after it.
- **Manual QA checklist** (§10) run per phase on the deployed branch.

## 4. Target architecture

```
/
├── index.html, 2048.html, sudoku.html, kakuro.html, theme-builder.html
├── css/                        (unchanged structure; small dedupe, see Phase 4)
├── js/
│   ├── core/                   ← dependency-free utilities (DOM allowed only in dom.js)
│   │   ├── dom.js              $, $$, el() builder
│   │   ├── storage.js          loadJSON, saveJSON, removeKey, STORAGE_KEYS registry
│   │   ├── random.js           defaultRandom, seededRandom(seed), shuffle(arr, rand)
│   │   └── time.js             formatTime, createTicker (interval wrapper)
│   ├── ui/                     ← shared DOM components (no game logic)
│   │   ├── settings-panel.js   open/close + backdrop wiring + toggle binding
│   │   ├── shared-sections.js  injects the Appearance/Background settings markup
│   │   ├── pick-list.js        renders .pick-row option lists (anims, tile modes, themes)
│   │   ├── numpad.js           renders 1–9 pad with per-game decorators
│   │   ├── overlay.js          win/lose overlay show/hide
│   │   ├── toast.js            toast notifications (currently kakuro-only)
│   │   └── puzzle-switcher.js  the header ☰ dropdown (moves out of common.js)
│   ├── theme/
│   │   ├── theme.js            built-in THEMES, applyTheme, loadTheme
│   │   ├── custom-themes.js    load/save/inject custom themes, hexToRgb, escapeHtml
│   │   ├── background.js       bg image + board alpha
│   │   └── theme-picker.js     syncThemePicker, split into small functions
│   ├── games/
│   │   ├── sudoku/
│   │   │   ├── engine.js       generate, solve, countSolutions, isValid, legality  (PURE)
│   │   │   ├── state.js        game state object, save/restore, config defaults    (PURE)
│   │   │   ├── render.js       board, highlights, numpad decorators, mistake dots
│   │   │   ├── input.js        tap handlers, keyboard, pencil mode
│   │   │   ├── settings.js     settings panel bindings
│   │   │   └── main.js         composition root, boot
│   │   ├── kakuro/
│   │   │   ├── engine.js       the K module: layout, fill, tighten, solve, combos  (PURE)
│   │   │   ├── state.js        entries/notes/timer state, persist/restore          (PURE)
│   │   │   ├── render.js       board, numpad, combos sheet
│   │   │   ├── input.js        selection, keyboard, notes mode
│   │   │   ├── settings.js
│   │   │   └── main.js
│   │   └── 2048/
│   │       ├── engine.js       computeMove, spawnTile, hasMoves, milestones        (PURE)
│   │       ├── state.js        grid/score/undo/persistence                         (PURE)
│   │       ├── tile-modes.js   TILE_MODES, tileLabel                               (PURE)
│   │       ├── fx/particles.js Particle classes (canvas-only, no game knowledge)
│   │       ├── fx/effects.js   spawnFx + per-anim launchers, ANIMS registry
│   │       ├── render.js       tiles, animation orchestration, bg grid
│   │       ├── input.js        keyboard + touch
│   │       └── main.js
│   ├── theme-builder/
│   │   ├── token-editors.js, saved-themes.js, import-export.js,
│   │   ├── preview.js, carousel.js, main.js
│   │   └── (split of current theme-builder.js along its existing comment sections)
│   └── pages/                  ← one tiny entry script per HTML page
│       ├── 2048.js  sudoku.js  kakuro.js  index.js  theme-builder.js
├── tests/
│   ├── core/*.test.js
│   ├── theme/*.test.js
│   ├── games/sudoku/*.test.js
│   ├── games/kakuro/*.test.js
│   ├── games/2048/*.test.js
│   └── golden/*.json           ← seeded golden-master fixtures
├── package.json, vitest.config.js, eslint.config.js, .prettierrc
└── .github/workflows/ci.yml
```

**Layering rule (enforced by ESLint `no-restricted-imports`):**
`core` imports nothing → `theme`/`ui` import only `core` →
`games/*/engine.js` + `state.js` import only `core` (and never `dom.js`) →
`render/input/settings` import engine + ui + core → `main.js` composes.

**Why ES modules:** they delete the implicit global-namespace coupling
(today `sudoku.js` silently depends on `$`, `shuffle`, `syncThemePicker`
existing as globals — nothing declares that). Modules make every
dependency explicit, enable tree-shaped reasoning, and are exactly what
Vitest imports in tests, so test code exercises the literal production
modules. HTML changes from three script tags to one:

```html
<script type="module" src="js/pages/sudoku.js"></script>
```

The only operational caveat: `file://` doesn't allow module imports, so
local dev needs `npx serve .` (documented in the README we'll write).
GitHub Pages is unaffected.

## 5. Phase plan

Each phase is one PR, independently shippable, ending with green CI and
the QA checklist.

---

### Phase 0 — Tooling baseline (no production code changes)

**What:** Add `package.json`, Vitest, ESLint (flat config), Prettier, and
a GitHub Actions workflow. Add a real `README.md` (currently empty).

**Why first:** every later phase needs `npm test` to exist before its
extraction lands.

```jsonc
// package.json
{
  "name": "puzzles",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint js tests",
    "format": "prettier --check .",
    "serve": "npx serve ."
  },
  "devDependencies": {
    "vitest": "^3.x",
    "jsdom": "^25.x",
    "eslint": "^9.x",
    "prettier": "^3.x"
  }
}
```

```js
// vitest.config.js — node env for pure engines, jsdom only where DOM is touched
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environmentMatchGlobs: [
      ['tests/ui/**', 'jsdom'],
      ['tests/theme/**', 'jsdom'],
    ],
    environment: 'node',
    coverage: { provider: 'v8', include: ['js/**'] },
  },
});
```

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run lint
      - run: npm test
```

**Fits with the rest:** zero impact on the served site; `node_modules` is
gitignored, GitHub Pages ignores the new config files.

---

### Phase 1 — `core/` + ES-module conversion of the shared layer

**What:** Split `js/common.js` and convert `js/theme.js` into the
`core/` and `theme/` modules above; convert all five HTML pages to
`type="module"` entry scripts. Game files temporarily become modules that
import what they need but keep their internal structure (engine
extraction is Phases 2–3).

**How — `core/random.js`, the keystone for testability:**

```js
// js/core/random.js
/** Default source — the games' current behaviour. */
export const defaultRandom = Math.random;

/** Deterministic PRNG (mulberry32). Same idea as kakuro's internal rng(). */
export function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates; identical to current common.js shuffle but injectable. */
export function shuffle(arr, rand = defaultRandom) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
```

**How — `core/storage.js`:** same `loadJSON`/`saveJSON` bodies as
`js/common.js:12-22`, plus a single registry replacing the string keys
currently scattered across files (`'sudoku-cfg'`, `'2048best'`,
`'kakuro_save_v1'`, `'puzzle-theme'`, `BG_KEY`, …):

```js
// js/core/storage.js
export const STORAGE_KEYS = {
  theme: 'puzzle-theme',
  customThemes: 'puzzle-custom-themes',
  bgImage: 'puzzle-bg-image',
  boardAlpha: 'puzzle-board-alpha',
  sudokuCfg: 'sudoku-cfg',
  sudokuHistory: 'sudoku-history',
  best2048: '2048best',
  history2048: '2048-history',
  kakuroSave: 'kakuro_save_v1',
  kakuroSettings: 'kakuro_settings_v1',
  kakuroHistory: 'kakuro-history',
  kakuroTip: 'kakuro_tip_combos',
};
```

**Why:** keys are the public API of our persistence; keeping the literal
values identical (note the inconsistent naming — we keep it, renaming
would orphan users' saves) while centralizing them prevents typo-bugs and
documents the save surface in one place.

**How — theme split:** `js/theme.js` currently mixes five concerns
(builtin themes, custom theme CSS injection, bg image, alpha slider, and
a 75-line `syncThemePicker` that also wires file inputs). It becomes four
small modules; `custom-themes.js` absorbs the duplicated helpers
(`_hexToRgb`/`tbHexToRgb`, `_esc`/`tbEsc` exist twice today —
`js/theme.js:12-19` vs `js/theme-builder.js:48-55`). Boot order is
preserved by the page entry module:

```js
// js/pages/sudoku.js
import '../ui/puzzle-switcher.js';     // self-wiring, as common.js IIFE is today
import { loadTheme } from '../theme/theme.js';
import { loadBgImage, loadBoardAlpha } from '../theme/background.js';
import { boot } from '../games/sudoku/main.js';

loadTheme(); loadBgImage(); loadBoardAlpha();   // before first paint of board
boot();
```

**Tests added in this phase:** `tests/core/*` — `formatTime` (0 → `0:00`,
61 → `1:01`, 600 → `10:00`), `shuffle` (permutation property, determinism
under `seededRandom`, input not mutated), `loadJSON`/`saveJSON` (round-trip,
corrupted JSON → fallback, quota errors swallowed), and
`tests/theme/custom-themes.test.js` (`hexToRgb('#7c6af7')` →
`'124, 106, 247'`, escapeHtml, custom theme CSS injection into jsdom
`<head>`, applyTheme sets `data-theme` + persists).

---

### Phase 2 — Extract the three pure engines (+ characterization tests)

This is the heart of the refactor. Each game's rules become a pure module
with **no DOM, no localStorage, no globals, injectable randomness**.

#### 2a. Sudoku engine (`games/sudoku/engine.js`)

Source: `js/sudoku.js:27-107`. Moves verbatim except: `shuffle` is
imported, `rand` is threaded through, and `isLegalPlacement` (which today
reads the global `puzzle`/`playerBoard` — `js/sudoku.js:89-107`) takes the
boards as parameters:

```js
// js/games/sudoku/engine.js
import { shuffle } from '../../core/random.js';
import { defaultRandom } from '../../core/random.js';

export const CLUES = { easy: 45, medium: 36, hard: 28, expert: 22 };

export function makePuzzle(difficulty, rand = defaultRandom) {
  const solved = generateSolved(rand);
  const puzzle = solved.map((r) => [...r]);
  // ... identical removal loop, using shuffle(cells, rand) ...
  return { puzzle, solved };
}

export function isValid(board, row, col, num) { /* unchanged body */ }
export function countSolutions(board, limit = 2) { /* unchanged body */ }

/** Live-board legality (givens + player entries), was isLegalPlacement. */
export function isLegalPlacement(puzzle, playerBoard, row, col, num) { /* body unchanged, params instead of globals */ }
```

`isValid` and `isLegalPlacement` share their row/col/box scan via one
internal `conflicts(getCell, row, col, num)` helper — the two functions
are 80% duplicated today.

**Characterization tests** (`tests/games/sudoku/engine.test.js`):

```js
import { describe, it, expect } from 'vitest';
import { makePuzzle, countSolutions, isValid, CLUES } from '../../../js/games/sudoku/engine.js';
import { seededRandom } from '../../../js/core/random.js';

const isSolvedBoard = (b) => /* every row/col/box is a permutation of 1..9 */;

describe('makePuzzle', () => {
  for (const diff of ['easy', 'medium', 'hard', 'expert']) {
    it(`${diff}: unique solution, clue count ≥ target, givens match solution`, () => {
      const { puzzle, solved } = makePuzzle(diff, seededRandom(42));
      expect(isSolvedBoard(solved)).toBe(true);
      expect(countSolutions(puzzle)).toBe(1);
      const clues = puzzle.flat().filter(Boolean).length;
      expect(clues).toBeGreaterThanOrEqual(CLUES[diff]);
      puzzle.forEach((row, r) => row.forEach((v, c) => {
        if (v) expect(v).toBe(solved[r][c]);
      }));
    });
  }
  it('is deterministic for a fixed seed (golden master)', () => {
    expect(makePuzzle('medium', seededRandom(7)).puzzle)
      .toEqual(JSON.parse(readFixture('sudoku-medium-seed7.json')));
  });
});
```

The golden fixture is generated **before** any cleanup commit, from the
verbatim-moved code, so subsequent cleanups are provably behaviour-neutral.

#### 2b. Kakuro engine (`games/kakuro/engine.js`)

Source: the `K` IIFE, `js/kakuro.js:4-255`. This is already pure and
already seed-injected — the best-architected code in the repo. The move
is mechanical: unwrap the IIFE into named exports (`segments`, `combos`,
`comboCount`, `tightenCombos`, `solve`, `evaluate`, `hint`, `candidates`,
`generate`), export `rng` as part of `core/random.js` consumers, and
**reformat**: the current code is minified-style (multiple statements per
line, single-char names). Reformatting is the one place we touch bodies;
the golden tests pin behaviour first, then Prettier + manual renaming
(`bd` → `digitMask`, `pc` → `popcount`, …) lands as a separate commit.

**Tests:**

```js
describe('combos', () => {
  it('enumerates digit sets: 2 cells summing 4 → only {1,3}', () => {
    expect(combos(2, 4)).toEqual([0b1010]);          // bitmask for digits 1,3
  });
  it('classic: 4 cells summing 10 → {1,2,3,4} only', () => {
    expect(comboCount(4, 10)).toBe(1);
  });
  it('impossible sums are empty', () => {
    expect(combos(2, 3 + 9 * 9)).toEqual([]);
  });
});

describe('generate + solve round trip', () => {
  it.each([['easy', 5], ['medium', 7], ['hard', 9]])('%s %i×%i', (level, size) => {
    const g = generate(level, size, 1234);
    expect(solve(g.board, g.clues, g.R, g.C, 2).count).toBeGreaterThanOrEqual(1);
    // the shipped solution actually satisfies every clue:
    expect(evaluate(g.board, g.clues, g.R, g.C, g.solution).complete).toBe(true);
  });
});

describe('evaluate', () => {
  it('flags duplicate digits in a run and over-sum partial runs', () => { /* fixture board */ });
});

describe('hint', () => {
  it('returns conflict:true when entries contradict all solutions', () => { /* … */ });
  it('respects a target cell when provided', () => { /* … */ });
});
```

#### 2c. 2048 engine (`games/2048/engine.js`)

Source: `js/2048.js:506-561` + `729-745`. The key change: `computeMove`
currently closes over the global `grid` (`js/2048.js:531`) — it takes the
grid as a parameter and stays otherwise identical. `spawnTile` takes
`rand` and a `nextId` callback instead of mutating module-level `uid`:

```js
// js/games/2048/engine.js
export const N = 4;
export const WIN_MILESTONES = [2048, 4096];

export const mkGrid = () => Array.from({ length: N }, () => Array(N).fill(null));
export const deepClone = (g) => g.map((row) => row.map((cell) => (cell ? { ...cell } : null)));

/** @returns {null | {newGrid, gained, moves}} null when nothing moves. */
export function computeMove(grid, dir) { /* body unchanged apart from the parameter */ }

export function spawnTile(g, rand, nextId) { /* unchanged; id = nextId() */ }
export function hasMoves(g) { /* unchanged */ }
export function highestTile(g) { /* extracted from checkWin */ }
```

**Tests** — the merge rules are where 2048 clones classically go wrong,
so they get exhaustive coverage:

```js
const row = (...vals) => /* build a 4×4 grid with one populated row */;

it('merges equal neighbours once per move: [2,2,2,2] → [4,4], gained 8', () => {
  const res = computeMove(row(2, 2, 2, 2), LEFT);
  expect(vals(res.newGrid[0])).toEqual([4, 4, null, null]);
  expect(res.gained).toBe(8);
});
it('does not chain-merge: [4,2,2,_] → [4,4,_,_] not [8,…]', () => { /* … */ });
it('merges the far pair first: [2,2,2,_] → [4,2,_,_] moving left', () => { /* … */ });
it('returns null when no tile can move', () => { /* … */ });
it('keeps tile ids stable through slides (animation contract)', () => { /* … */ });
it('hasMoves: full grid with one adjacent pair → true; checkerboard → false', () => { /* … */ });
```

That `moves[]` id contract is load-bearing — the whole slide animation in
`animateMove` keys off it — which is exactly why it deserves a pinned test.

**Also in 2c:** delete dead code found during reading — `findCell`
(`js/2048.js:559`) and `findCellEl` (`js/2048.js:649`) are never called.

---

### Phase 3 — Shared UI layer (kill the copy-paste)

**The duplication inventory this phase removes:**

| Duplicated thing | Copies today |
|---|---|
| `openSettings`/`closeSettings` + backdrop wiring | `js/2048.js:124-136`, `js/sudoku.js:467-479`, `js/kakuro.js:621-630` |
| `onToggle(id, key, …)` settings binder | `js/sudoku.js:482-489`, `js/kakuro.js:632-638` |
| Appearance + Background settings markup (~45 lines) | `2048.html:51-90`, `sudoku.html:74-112`, `kakuro.html:72-110` |
| Puzzle-switcher dropdown markup | all three game HTML headers |
| `.pick-row` option-list rendering | `buildAnimPicker`/`buildTilePicker` (`js/2048.js:89-111`), custom-themes list (`js/theme.js:120-130`) |
| 1–9 numpad construction | `js/sudoku.js:248-273`, `js/kakuro.js:403-418` |
| Win/lose overlay show/hide | sudoku `endGame`, kakuro `doWin`, 2048 `showOverlay` |
| `hexToRgb` + HTML escaping | `js/theme.js:12-19`, `js/theme-builder.js:48-55` |

**How — settings panel:**

```js
// js/ui/settings-panel.js
import { $ } from '../core/dom.js';

export function initSettingsPanel({ onOpen } = {}) {
  const panel = $('#settingsPanel'), backdrop = $('#settingsBackdrop');
  const open = () => { onOpen?.(); backdrop.classList.add('show'); panel.classList.add('show'); };
  const close = () => { backdrop.classList.remove('show'); panel.classList.remove('show'); };
  $('#settingsBtn').addEventListener('click', open);
  backdrop.addEventListener('click', close);
  return { open, close, isOpen: () => panel.classList.contains('show') };
}

/** Generic checkbox→config binder (replaces both games' onToggle). */
export function bindToggle(id, get, set, after) {
  $('#' + id).addEventListener('change', (e) => { set(e.target.checked); after?.(); });
  $('#' + id).checked = get();
}
```

Each game's `settings.js` then declares its toggles as data:

```js
// js/games/sudoku/settings.js (shape)
const TOGGLES = [
  ['togHighlight', 'highlight'], ['togSameNum', 'sameNum'],
  ['togHighlightPencil', 'highlightPencil'], /* … the 11 from sudoku.js:490-500 */
];
for (const [id, key] of TOGGLES) {
  bindToggle(id, () => cfg[key], (v) => { cfg[key] = v; saveCfg(); }, refreshAll);
}
```

**How — shared settings markup:** the Appearance and Background Image
sections are byte-identical across three HTML files (and will drift the
moment someone adds a theme — they're exactly the kind of duplication
that rots). `ui/shared-sections.js` injects them at boot into a
placeholder, so the HTML files shrink and there's one source of truth:

```html
<!-- in each game's #settingsPanel, replacing ~45 duplicated lines -->
<div data-shared-settings></div>
```

```js
// js/ui/shared-sections.js — template generated from THEMES, not hand-written rows
import { THEMES } from '../theme/theme.js';
export function injectSharedSections() {
  const slot = document.querySelector('[data-shared-settings]');
  if (!slot) return;
  slot.outerHTML = appearanceSectionHtml(THEMES) + backgroundSectionHtml();
}
```

This also fixes a latent inconsistency: the `THEMES` array in
`js/theme.js:1-6` and the hand-written rows in three HTML files must agree
today, but nothing enforces it. After this phase, `THEMES` is the single
source.

**How — numpad:** one renderer with a decorator hook covers both games:

```js
// js/ui/numpad.js
export function renderNumpad(container, { onTap, decorate }) {
  container.innerHTML = '';
  for (let n = 1; n <= 9; n++) {
    const btn = el('div', { className: 'num-btn' }, el('span', { className: 'np-label' }, n));
    decorate?.(btn, n);                       // sudoku: counts/selected; kakuro: dim
    btn.addEventListener('pointerdown', () => onTap(n));
    container.appendChild(btn);
  }
}
```

(The current inline `label.style.cssText='pointer-events:none'` in both
games becomes a `.np-label` rule in `theme.css` — styling belongs in CSS.)

**CSS dedupe rider:** game pages currently load all 640 lines of
`css/theme-builder.css` (see `sudoku.html:9`) only for the 17 lines of
`.pick-row-link` styles (`css/theme-builder.css:513-529`). Move those
rules into `css/theme.css` and drop the extra stylesheet link from the
three game pages. Likewise `.num-btn` base rules, duplicated between
`css/sudoku.css:165` and `css/kakuro.css:205`, move to `theme.css` with
game files keeping only their modifiers (`.num-selected`, `.dim`, …).

**Tests:** jsdom tests for `settings-panel` (open/close class toggling,
`onOpen` called), `pick-list` (selection rendering, click → callback,
escaping of user-provided theme labels), `numpad` (9 buttons, decorator
invoked per button), `shared-sections` (one row per THEMES entry).

---

### Phase 4 — Game controllers: state/render/input split

With engines and shared UI in place, each game's remaining code splits
along seams that already exist as comment banners in the files.

**Pattern (sudoku as the example):**

- `state.js` — owns `puzzle/solution/playerBoard/pencilMarks/selected/…`
  as one state object plus `cfg`. Exposes intent functions that mutate
  state and return *what changed*, never touching the DOM:

```js
// js/games/sudoku/state.js (shape)
export function createGame() { /* returns the state container */ }

/** was placeNumber (sudoku.js:328) minus render calls; returns events. */
export function placeNumber(game, r, c, n) {
  if (game.puzzle[r][c] !== 0) return { type: 'noop' };
  if (game.pencilMode) { /* toggle mark */ return { type: 'pencil' }; }
  if (game.playerBoard[r][c] === n) { game.playerBoard[r][c] = 0; return { type: 'erase' }; }
  game.playerBoard[r][c] = n;
  /* … pencil clearing, mistake counting — same logic, no $() calls … */
  if (strikeOut) return { type: 'lose' };
  return { type: 'place', won: isWon(game) };
}
```

- `render.js` — `renderBoard(game)`, `applyHighlights(game)`,
  `renderNumpad(game)` (via `ui/numpad.js`), `updateMistakeDots(game)`.
  Pure state → DOM, current bodies preserved.
- `input.js` — pointer + keyboard handlers translate events into state
  intents, then call render. The keyboard handler gains the settings-open
  guard (bug fix B1 below).
- `main.js` — composition: builds state, wires input, restores or starts.

**Why returns-events instead of render-inside-mutation:** today
`placeNumber` calls `renderBoard(); renderNumpad(); checkWin(); saveGameState();`
itself (`js/sudoku.js:353`) — every state function knows about every
renderer, which is why nothing is testable. The event-return style lets
`main.js` own the "after any change: render + persist" policy in one
place, and lets tests drive full game scenarios (place numbers until win,
strike out at the limit, hint into a selected cell) with zero DOM.

**State-level tests this enables** (`tests/games/sudoku/state.test.js`):
toggle-off on same number, pencil marks cleared on placement,
`erasePencilMarks` clears row/col/box, strike limit ends game at exactly
`cfg.strikeLimit`, unlimited (0) never ends, hint prefers the selected
cell, win detected on last correct cell, save→restore round-trips every
field including `Set`-based pencil marks (the serialization at
`js/sudoku.js:129` / `:591` is easy to regress).

Kakuro and 2048 follow the same pattern; 2048's `fx/` modules stay
DOM/canvas-only and get no unit tests (visual, non-deterministic — covered
by the QA checklist instead), but `fx/effects.js` keeps a thin seam so
`render.js` can run with FX disabled in jsdom.

---

### Phase 5 — Bug fixes (separate commits, each with a regression test)

Found while auditing for this plan. All are behaviour bugs, so fixing them
is "keeping functionality" in the sense that matters; none change intended
behaviour.

| # | Bug | Where | Fix |
|---|-----|-------|-----|
| B1 | Typing in the settings panel plays the game. Sudoku: digits/`p`/Backspace in the bg-image URL field place numbers and toggle pencil. 2048: arrows/WASD move tiles and `preventDefault` breaks cursor keys in the input. Kakuro already guards this (`js/kakuro.js:646`). | `js/sudoku.js:563`, `js/2048.js:773` | Keyboard handlers early-return when `settingsPanel` is open or `e.target` is an input/select. |
| B2 | Strike limits 5/10 misrender: header has exactly 3 dots (`sudoku.html:23-25`), `updateMistakeDots` computes `lim` then ignores it (`js/sudoku.js:276`). With limit 5, mistakes 4–5 show nothing. | `js/sudoku.js:275-281` | Render dots dynamically from `cfg.strikeLimit` (cap display at, say, 10; hide when unlimited). |
| B3 | 2048's global `touchmove` `preventDefault` (`js/2048.js:779`) blocks scrolling the settings panel and dropdowns on touch devices. | `js/2048.js:777-786` | Attach swipe handling to `.board-wrap` instead of `document.body` (or skip when the panel is open). |
| B4 | A restored game-over Sudoku is a dead board: `restoreSudoku` keeps `gameOver=true` but hides the overlay (`js/sudoku.js:595,604`), so no input works and no "Play again" is reachable except New Game. | `js/sudoku.js:583-606` | If the last snapshot is game-over, re-show the overlay (or restore the previous non-terminal snapshot). |
| B5 | 2048 lingering-particle cleanup duplicated 3× with slight drift (`newGame`, `restore2048`, `fxKill`). `newGame`/`restore2048` reimplement `fxKill` inline. | `js/2048.js:670-697` | Call `fxKill()`; single implementation. |
| B6 | `animateMove` finds merge-destination elements by scanning all of `elMap` per merge (`js/2048.js:635-642`); `elMap[newGrid[r][c].id]` is a direct lookup. O(n²)→O(1), removes the odd `parseInt(dataset)` round-trip. | `js/2048.js:634-643` | Direct map lookup. |
| B7 | Kakuro `persist()` writes the full state twice on every keystroke — once to `kakuro_save_v1` and once into a 20-deep `kakuro-history` ring (`js/kakuro.js:584-586`); history is never read. Same pattern in sudoku: 20 full snapshots/move, only the last is ever restored. | `js/kakuro.js:578-586`, `js/sudoku.js:122-135` | Keep the save key + shape identical; throttle/trim the history ring (it's write-only today). Decision point: keep ring for a future "resume earlier" feature or drop to a single slot. Plan: keep `pushHistory` but cap at 5 and document it. |
| B8 | Leftover dead code from removed pause feature: `boardEl.style.filter='none'; boardEl.style.pointerEvents='auto'` (`js/kakuro.js:291`); dead `findCell`/`findCellEl` (`js/2048.js:559,649`); unused `ALPHA` slider double-write. | various | Delete. |
| B9 | `confirm()`-based delete in theme builder (`js/theme-builder.js:338`) is fine, but `doDelete` doesn't clear an in-progress edit of the deleted theme — saving afterwards resurrects it with the old id. | `js/theme-builder.js:337-343` | If `draft.id === id`, reset draft to new. |

Each fix lands with a test that fails before and passes after (B1/B3 as
jsdom event tests, B2/B4–B9 as unit tests on the new modules).

---

## 6. Testing strategy (the full suite, after refactor)

**Tooling: Vitest + jsdom.** Vitest because it's the modern, zero-config
runner with native ESM support (matches our no-build constraint), first
class watch mode, and built-in v8 coverage.

**Test pyramid for this codebase:**

1. **Engine unit tests (most tests live here).** Pure, fast,
   property-style where it pays off:
   - Sudoku: validity invariants, uniqueness, difficulty clue counts,
     determinism per seed, `isLegalPlacement` vs `isValid` consistency.
   - Kakuro: combinatorics (`combos`/`comboCount` against hand-computed
     tables), generator round-trips at sizes 5/7/9/12 × all levels,
     `evaluate` error-flag fixtures, `hint` conflict and target behaviour,
     `candidates` against a hand-solved fixture board.
   - 2048: full merge-rule matrix (all 4 directions × edge layouts),
     score accounting, id stability, `hasMoves`, milestone logic incl.
     `wonAcked` (reach 2048 → ack → no re-trigger until 4096).
2. **State/controller tests.** Scenario tests driving the state modules:
   complete a Sudoku via hints, strike out, undo in 2048 (single-level
   undo semantics: second undo is a no-op — `js/2048.js:720-727`), kakuro
   notes auto-erase within runs only.
3. **Persistence tests.** Round-trip every storage shape; backward
   compatibility: a fixture captured from the *current* production
   localStorage format must restore correctly forever (guards the
   "saved games survive the refactor" promise).
4. **DOM component tests (jsdom).** Shared UI components + theme
   injection + the B1/B3 input-guard regressions.
5. **Manual QA checklist (§10)** for the visual/animation layer — canvas
   particles, slide animations, theme rendering — where automated DOM
   assertions would test the mock, not the experience.

**Coverage target:** 90%+ on `js/core`, `js/theme`, `js/games/*/engine.js`
and `state.js`; render/input/fx explicitly exempted with a comment in the
config. Coverage is a floor for the pure layer, not a goal in itself.

## 7. Sequencing & deliverables summary

| PR | Contents | Risk |
|----|----------|------|
| 0 | Tooling, CI, README | none |
| 1 | `core/` + `theme/` modules, ESM page entries, core/theme tests | low — mechanical, behaviour pinned by tests |
| 2 | Three engines extracted + characterization & golden tests | medium — mitigated by verbatim-move-then-clean commits |
| 3 | Shared UI layer, HTML dedupe, CSS dedupe | medium — visual QA pass required |
| 4 | Controllers split (state/render/input/main) per game ×3 (can be 3 PRs) | medium |
| 5 | Bug fixes B1–B9, one commit each with regression test | low |
| 6 | Test-suite expansion to targets, coverage gate in CI | none |

Estimated end state: largest file ~250 lines, every line of game logic
unit-testable, four HTML files with zero duplicated settings markup, one
copy of every helper.

## 8. Definition of done

- All games play identically (QA checklist passes on a deployed preview).
- Existing localStorage saves/themes from production restore correctly
  (verified by the compatibility fixtures in §6.3).
- `npm test` green in CI on every PR; lint clean; coverage floor met.
- No global identifiers except the five page entry modules.
- `plans/refactor-and-testing.md` (this file) checked off per phase.

## 9. Recommendations (post-refactor upgrades — not in refactor scope)

Ordered by value-for-effort for a "premium" feel:

1. **Persist 2048 animation & tile-mode choices.** `currentAnim` /
   `currentTileMode` reset on every reload today (`js/2048.js:31,82`) —
   the only settings in the suite that don't persist. One `STORAGE_KEYS`
   entry each. (Borderline bug; kept out of Phase 5 only because current
   behaviour might be intentional.)
2. **Move Kakuro generation to a Web Worker.** `K.generate` runs on the
   UI thread behind a 20ms `setTimeout` (`js/kakuro.js:293`); a 12×12 hard
   grid can jank visibly. The engine extraction (Phase 2b) makes it
   worker-loadable as-is.
3. **PWA**: manifest + service worker → installable, offline play. For a
   localStorage-based puzzle suite this is cheap and very premium.
4. **Accessibility pass**: the board cells are `div`s with no roles;
   numpad buttons are `div`s; settings toggles are fine. Add
   `role="grid"/"gridcell"`, `aria-pressed` on pickers, focus trapping in
   the settings sheet, `prefers-reduced-motion` support for the FX layer.
5. **Daily seeded puzzles**: the seeded RNG work makes "Daily Sudoku
   #347 — same board for everyone" a ~50-line feature with shareable
   results.
6. **JSDoc + `// @ts-check`** on `core/` and engines: editor-level type
   safety with zero toolchain change.
7. **Playwright smoke test** in CI: load each page, start a game, make a
   move, toggle a theme — catches the "module failed to load" class of
   failure that unit tests can't.
8. **Restore the best-time feature** Kakuro used to have
   (`kakuro-removed-features.md` §2) and add it to Sudoku — natural fit
   once state modules exist, and a strong retention feature.
9. **Multi-step undo for Sudoku/Kakuro** — the write-only history ring
   (B7) suggests this was the original intent; the state-module refactor
   makes it a small, well-tested feature instead of a snapshot hack.

## 10. Manual QA checklist (run per phase on the deployed branch)

- [ ] Each game: new game, complete-or-fail flow, overlay buttons work
- [ ] Sudoku: both input modes, pencil mode, hint into selected cell,
      candidates/excluded overlays, strike limits 3/5/10/unlimited,
      keyboard (digits, arrows, P, Backspace)
- [ ] Kakuro: sizes 5→12 × all difficulties generate; combos sheet from
      clue taps (incl. dual-clue cells, both halves); notes; hint; autocheck
- [ ] 2048: all 7 animation styles fire on merge; all 7 tile modes render;
      undo exactly once; 2048 then 4096 milestone overlays; swipe on mobile
- [ ] Themes: all 4 built-ins × all 4 pages; custom theme create → apply →
      edit → delete; export → import round-trip; bg image via URL, upload,
      and clear; board opacity slider
- [ ] Persistence: hard-refresh mid-game restores all three games;
      pre-refactor saved state (kept in a browser profile) still restores
- [ ] Mobile Safari + Chrome Android: settings sheet scrolls (B3), no
      pinch-zoom regressions, switcher dropdown works
