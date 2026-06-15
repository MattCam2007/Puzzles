# Plan: Add Logic Grid (Logic Elimination Puzzles) as the 5th puzzle

Goal: add a **logic-grid deduction puzzle** ("zebra puzzle" / "Einstein
riddle" family) as a fifth game, wired into the suite **exactly** the way
2048, Sudoku, Kakuro and Minesweeper are — same file layout, same shared
CSS/JS, same header/switcher/settings/overlay/theming patterns. The puzzle
mechanic (a procedurally generated set of clues that uniquely determine which
attribute each entity has, solved by marking ✓/✗ in an elimination grid) comes
from the uploaded proof-of-concept; only the *skin* and *integration* become
this app's design language, and the **difficulty model is the main new design
work** (see §3).

The POC is a single self-contained `index.html` with its own dark styling and
all logic inline. This plan keeps its **engine ideas** (procedural solution →
candidate clues → trim to a minimal solvable set; constraint-propagation
solver; ✓/✗/auto-eliminate cell cycling; clue list with filter + highlight) and
discards its **styling and DOM**, replacing them with the suite's shared chrome.

---

## 1. Architecture recap (the pattern every game follows)

Each game is exactly three files plus shared infra (verified against the four
existing games and `plans/adding-a-game.md`):

| Per-game file     | Shared infra (do not fork)                                                            |
| ----------------- | ------------------------------------------------------------------------------------ |
| `logic.html`      | `css/theme.css` (tokens, header? **no** — see below; settings sheet, switcher, sliders) |
| `css/logic.css`   | `css/theme-builder.css` (`.pick-row-link`, `.pick-arrow`)                            |
| `js/logic.js`     | `js/common.js` (`$`, `$$`, `loadJSON`, `saveJSON`, `pushHistory`, `shuffle`, `formatTime`, switcher) |
|                   | `js/theme.js` (`syncThemePicker`, bg image, board-opacity)                          |

Conventions to mirror 1:1:

- **HTML head order**: `theme.css` → `css/logic.css` → `theme-builder.css`.
- **`theme.css` does NOT define** `.header`, `.score-box`, `.board-top-bar`,
  `.btn`, `.btn-top`, `.difficulty-select`, `.board-wrap`, `.overlay`/
  `.overlay-card`/`.btn-primary`. Those are duplicated in every game's own CSS.
  **`logic.css` must include the full shared layout block**, copied from
  `sudoku.css` (closest analog). Skipping it renders the page unstyled.
- **Header** (`.header` / `.header-right`): gradient `.title`, one or more
  `.score-box` stat readouts, the **puzzle switcher** dropdown (now **five**
  options), and the `⚙️` `#settingsBtn`.
- **Top bar** (`.board-top-bar`): left = `New Game` (`.btn.accent`) +
  `.difficulty-select`; right = `.board-top-right` action buttons (`.btn-top`).
- **Settings**: shared bottom-sheet (`.settings-panel` / `#settingsBackdrop`).
  First two sections are **always** the verbatim shared *Appearance* (theme
  picks + `#customThemesList` + board-opacity slider) and *Background Image*
  blocks. Game-specific sections follow.
- **Win**: shared `.overlay` / `.overlay-card` (`#overlayTitle`, `#overlayMsg`,
  `#overlayBtn`). There is no "lose" state in a logic puzzle (see §4), so no
  `.banner` is needed.
- **Scripts**, in order: `js/common.js` → `js/theme.js` → `js/logic.js`.
- **State**: `cfg = Object.assign({}, DEFAULTS, loadJSON('logic-cfg', {}))`,
  `saveCfg()`; in-progress game persisted via `pushHistory('logic-history', …)`
  and restored on load (`if (!restoreLogic()) startGame();`).
- **Theme picker** wired by calling shared `syncThemePicker()` inside
  `openSettings()`.

Naming chosen for the new game:

| Thing            | Value                                   |
| ---------------- | --------------------------------------- |
| Display name     | **Logic Grid**                          |
| Files            | `logic.html`, `css/logic.css`, `js/logic.js` |
| Emoji            | 🕵️ (detective — distinct from 🔢 ✏️ ➕ 💣) |
| localStorage     | `logic-cfg`, `logic-history`, `logic-best` |
| Home-card desc   | "Cross-reference the clues to deduce who's who" |

---

## 2. What the puzzle is (rules to implement)

A puzzle has **N entities** (the row anchors — e.g. 4 people) and **C attribute
categories** (e.g. Job, Pet, City), each category holding exactly N distinct
values. Every entity owns exactly one value from each category, and each value
is owned by exactly one entity (a perfect matching per category). The player is
given a set of **clues** and must deduce the full assignment with **no
guessing** — the clue set is generated to force a single solution.

- **Solving surface**: an elimination grid. Rows = the N entities. Columns =
  every `(category, value)` pair, grouped under a category header (the POC's
  layout — entity-row grid, *not* the classic NxN triangular grid, because it
  is far more mobile-friendly inside the 420px column).
- **Cell cycling**: tap a cell to cycle **blank → ✓ → ✗ → blank** (POC states
  `0/1/2`). A fourth state, **auto-eliminated** `·` (POC state `3`), is written
  by the assist logic, not by the user, and is skipped by the manual cycle.
- **Auto-elimination** (assist, difficulty-defaulted toggle, §3): marking ✓ in
  a cell crosses out (`·`) the rest of that entity's row *within that category*
  and the same value for every other entity. This is the POC's `cycleCell`
  behaviour, made optional.
- **Clue types** (the difficulty palette, §3): direct **positive**, direct
  **negative**, **relational** (link two attributes — "the Tea drinker is the
  Pilot"), and a **comparative/ordinal** clue type to be **added** on top of the
  POC ("the Pilot's decade is earlier than the Chef's").
- **Win**: every entity has its correct value marked ✓ for every category (the
  POC's `checkWin`). Optionally also require zero *wrong* ✓ to count as solved.
- **No lose state**; instead provide Check / Contradictions / Hint assists.
- **Best time per difficulty** persisted (like Minesweeper), surfaced in the
  win overlay and a header `Best` stat.

---

## 3. Difficulty model (the core new design)

Difficulty is built from **three independent levers**, bundled into four named
tiers exposed by the `.difficulty-select`. The levers are deliberately
orthogonal so the model "makes sense" and is tunable.

### Lever A — Grid size (`items N × categories C`)
The dominant lever: more rows and more categories means exponentially more
pairings to track.

### Lever B — Clue composition (kind + directness of clues)
From easiest to hardest to use:
1. **Positive** — "Petra is the Pilot." Fills one cell immediately.
2. **Negative** — "Petra is not the Chef." One elimination.
3. **Relational** — "the Pilot drinks Tea." Links two attributes; forces
   cross-category reasoning.
4. **Comparative / ordinal** — "the Pilot's decade is earlier than the Chef's."
   Requires an *ordered* category and chained reasoning. **New type** (§5.3).

Harder tiers shift the mix toward (3)/(4) and **forbid direct positives**, so
the solver must chain deductions instead of reading answers off the clue list.

### Lever C — Clue economy (redundancy vs. minimality)
- Easy: keep a couple of **redundant/direct** clues so there is slack — the
  player rarely chains more than one step.
- Hard/Expert: trim to a **strictly minimal** set (the POC's `buildPuzzle`
  already does greedy add-then-trim), forcing long deduction chains.

### The four tiers

| Tier       | Items × Cats | Grid cols (C×N) | Clue palette                                   | Economy            | Auto-elim default |
| ---------- | ------------ | --------------- | ---------------------------------------------- | ------------------ | ----------------- |
| **Easy**   | 4 × 3        | 12              | positive + negative, 1–2 relational            | slightly redundant | **on**            |
| **Medium** | 4 × 4        | 16              | balanced; relational common                    | near-minimal       | on                |
| **Hard**   | 5 × 4        | 20              | relational-heavy, ≥1 comparative, few positives| strictly minimal   | off               |
| **Expert** | 5 × 5        | 25              | indirect only (neg + relational + comparative), **no direct positives** | strictly minimal   | off               |

Notes:
- **Auto-elim default** is a fourth, softer difficulty lever: on Easy/Medium the
  grid crosses out implied cells for you; on Hard/Expert you do that bookkeeping
  yourself (the toggle is still user-overridable in Settings).
- The 20- and 25-column grids are **wider than 420px**: the board pans
  horizontally (`overflow-x:auto` on `.board-wrap`, cells clamped to a readable
  min), exactly the pattern Expert Minesweeper uses. See §6.

### Value/name pool sizing — required data change
The POC's `CATEGORY_POOL` values are arrays of **exactly 4** and `NAME_POOL`
groups are **exactly 4**. Tiers with **5 items** need **5 values per category**
and **5 names per group**. Before any 5×N tier can generate, the pools must be
extended to length 5 (the generator slices `0..N`, so longer pools are fine for
smaller tiers). This is a concrete, easy-to-miss prerequisite — call it out in
the data file.

### Marking a category as ordinal (for comparative clues)
Comparative clues need an *ordered* category. Tag the inherently ordered ones in
the pool, e.g. `{name:'Decade', ordinal:true, values:[...]}` (Decade, Season,
and any added Age/Floor/Rank category). Hard/Expert generation **guarantees at
least one ordinal category is picked** so a comparative clue is always possible.

---

## 4. Files to create

### 4.1 `logic.html`
Clone the structure of `sudoku.html`:

- Head: `theme.css` → `css/logic.css` → `theme-builder.css`, title "Logic Grid",
  viewport `maximum-scale=1.0, user-scalable=no` (taps on small cells — no zoom).
- `.header`:
  - `.title` → "Logic Grid"
  - `.score-box` **Time** (`#timer`)
  - `.score-box` **Hints** (`#hintCount`) — hints used this game
  - `.score-box` **Best** (`#bestTime`) — best for current difficulty
  - puzzle-switcher dropdown (now **five** options, §7)
  - `#settingsBtn` gear
- `.board-top-bar`:
  - left: `New Game` (`.btn.accent`, `#newGameBtn`) + `.difficulty-select`
    (`#difficultySelect`: Easy / Medium / Hard / Expert)
  - right (`.board-top-right`): `👁 Check` (`#checkBtn`), `⚠️ Contradictions`
    (`#contraBtn`), `💡 Hint` (`#hintBtn`). (Auto-elim and Reset move into
    Settings / a smaller control to avoid crowding; see §6.)
- **Clues panel** (`#cluesPanel`) above the board: a section label "Clues" with
  an optional **filter row** (filter-by-entity pills, POC feature) and the clue
  list (`#cluesList`). Clues are tappable to **highlight** (POC `hlClue`) and can
  be tapped again to **strike through** as "used" (new, low-cost affordance).
- `.board-wrap` → grid container `#board` (built in JS; sizing §6).
- A small inline **status line** (`#statusLine`) under the board for Check /
  Contradictions / Hint feedback (replaces the POC's `.status-bar`; reuse the
  `.toast` pattern from `kakuro.css` *or* a simple themed inline strip).
- **Settings panel** — shared Appearance + Background Image verbatim, then
  game-specific sections (§6.3).
- Win `.overlay` card (`#overlayTitle` / `#overlayMsg` / `#overlayBtn`).
- Scripts: `common.js` → `theme.js` → `logic.js`.

### 4.2 `css/logic.css`
1. **Copy the shared layout block** from `sudoku.css` first (header, score-box,
   difficulty-select, `.btn`/`.btn.accent`, board-top-bar, `.btn-top`, overlay/
   overlay-card/btn-primary). Without it the page is unstyled (see
   `adding-a-game.md` §4 / FAQ).
2. Game-specific rules:
   - `.logic-grid` table: `border-collapse`, category header bands
     (`.cat-header`), value column headers (rotated/clamped text for width),
     entity row headers (`.row-header`).
   - Cell states reskinned to tokens (POC used hardcoded greens/reds):
     - `.cell-yes` → `var(--success)` ✓, bold
     - `.cell-no`  → `var(--error)` ✗
     - `.cell-auto`→ `var(--text-muted)` `·`
   - Honor **board opacity**: every cell/surface background uses
     `color-mix(in srgb, <token> var(--board-alpha), transparent)` so the slider
     and bg-image show through (per `adding-a-game.md` §4).
   - Clue list: `.clue-item`, `.clue-item.highlighted`
     (`var(--accent-dim)` bg), `.clue-item.used` (struck-through, dimmed),
     filter pills `.filter-pill` / `.filter-pill.active` reskinned to tokens.
   - Cell sizing via `--cell` custom property (set in JS, §6) so wide tiers can
     shrink-to-min then pan.
   - **Per-theme overrides** at the bottom for legibility on the light **sakura**
     theme (✓/✗ and grid lines), mirroring how `sudoku.css` overrides `--given`
     for sakura.
   - `.toast` (copied from `kakuro.css`, lines 309–321) **if** the status line
     uses the toast style.

### 4.3 `js/logic.js`
Mirror `sudoku.js` / `minesweeper.js` structure and idioms. Port the POC's pure
functions, rename for clarity, and wrap them in the shared lifecycle.

1. **`DEFAULTS` + `cfg`**: `difficulty:'easy'`, `autoElim:true`,
   `showClueFilter:true`, `highlightContradictions:true`,
   `requireNoWrong:false`. `loadJSON('logic-cfg', {})` + `saveCfg()`.
2. **Presets**: `const LEVELS = { easy:{items:4,cats:3,palette:'easy'},
   medium:{items:4,cats:4,palette:'balanced'}, hard:{items:5,cats:4,palette:'hard'},
   expert:{items:5,cats:5,palette:'expert'} }` where `palette` drives clue mix.
3. **Data**: `CATEGORY_POOL` (≥5 values each, `ordinal` flags) + `NAME_POOL`
   (groups of ≥5) — ported from the POC and **extended to 5** (§3).
4. **Engine** (pure — ported/renamed from the POC):
   - `generateSolution(entities, categories)` — random perfect matching per
     category (POC `generateSolution`).
   - `solve(entities, categories, clueSet)` — constraint-propagation solver
     (POC `solveWithRelational`) **extended** to handle the new comparative
     clue type (propagate ordinal `<`/`>` constraints across the matched
     values). Returns a fully-solved grid or `null`.
   - `uniqueSolutionCheck(entities, categories, clueSet, solution)` — **new,
     important**: a backtracking search that confirms the clue set admits
     **exactly one** solution. The POC only checks *propagation-solvable*, which
     is sufficient when propagation alone finishes, but the harder palettes
     (which intentionally need deeper chains) want a real uniqueness guarantee
     to keep the "no guessing" promise. Use this as the acceptance test in
     `buildPuzzle`.
   - `generateClues(...)` (POC) **plus** `generateComparativeClues(...)` for
     ordinal categories; clue *candidates* are filtered by the tier's `palette`
     (e.g. Expert drops all `type:'positive'`).
   - `buildPuzzle(...)` (POC greedy add-until-solvable, then trim-to-minimal),
     using `uniqueSolutionCheck` as the predicate, and biased clue ordering per
     palette (direct clues first for Easy; indirect first for Hard/Expert).
   - `generatePuzzle(level)` — pick entities + C categories (guaranteeing an
     ordinal category for hard/expert), build, **retry with a bounded attempt
     count** (POC recurses unbounded — add a cap, e.g. 40 attempts, then relax
     the palette as a fallback so generation always terminates).
5. **Rendering**: `renderClues()` (filter pills + list, POC), `renderGrid()`
   (entity-row table, POC), `renderAll()`. Set `--cell`/`--cols` before render.
6. **Interaction**:
   - Tap cell → `cycleCell` (POC) honoring `cfg.autoElim`; re-render the touched
     cells (not the whole grid) for the 25-column Expert board.
   - Tap clue → highlight; second tap → mark used (strike). Filter pills set the
     active entity filter (POC `setFilter`).
   - **Difficulty `<select>` change → immediately `startGame()`** (like
     Minesweeper, because the grid dimensions change with level — confirmed
     `minesweeper.js:498`).
   - Buttons: `checkProgress` (✓ count vs needed, POC), `findContradictions`
     (two ✓ in a row/category, POC), `giveHint` (reveal one correct ✓ + auto-
     eliminate, increment `#hintCount`, POC), `autoElim`, `resetGrid` (POC).
7. **Timer**: `tickTimer` + `formatTime` from `common.js`; start in
   `startGame`, `clearInterval` on win.
8. **Win** (`checkWin`/`endGame`): when solved, stop timer, update
   `loadJSON('logic-best', {})` keyed by difficulty, fill `.overlay`
   (title "🎉 Solved!", msg with time, best, and hints used), `show` overlay.
   `#overlayBtn` → `startGame()`.
9. **Settings → UI**: `openSettings()` calls `syncThemePicker()`;
   `syncSettingsUI()` + `onToggle(...)` per toggle; `applySettingsToUI()` toggles
   the clue-filter row visibility and re-applies auto-elim.
10. **Persist/restore**: `saveGameState()` via `pushHistory('logic-history',
    snapshot, 2)` — the snapshot **must include the whole generated puzzle**
    (entities, categories, solution, clues) plus the current grid marks, hint
    count and elapsed seconds, because puzzles are procedural and cannot be
    regenerated from a seed (unless seeded RNG is added — out of scope, noted in
    §8). `restoreLogic()` rehydrates and re-renders; `if (!restoreLogic())
    startGame();` at the bottom.

---

## 5. Engine details worth getting right

### 5.1 Solver soundness vs. completeness
The POC's propagation solver is **sound** (never marks a wrong cell) but not
**complete** (some logically-forced puzzles need search). For Easy/Medium the
generated clue sets are propagation-complete by construction. For Hard/Expert,
gate acceptance on `uniqueSolutionCheck` (backtracking) so we never ship a
puzzle that needs a guess **or** that has two solutions.

### 5.2 Minimality / "no redundant clue" trimming
Keep the POC's reverse trim (remove each clue if the puzzle is still solvable
without it). For Easy, **stop trimming early** (or re-add 1–2 direct clues
after) to leave the intended slack from Lever C.

### 5.3 Comparative clue type (new)
- Only generated for categories flagged `ordinal:true`.
- Clue shape: `{type:'comparative', cat, lessEntityVal, moreEntityVal, text}`
  expressing `valueIndex(A) < valueIndex(B)` for two entities' values in that
  category, phrased naturally ("The Pilot is from an earlier decade than the
  Chef").
- Solver handling: maintain, per entity, the set of still-possible values in the
  ordinal category; a `<` constraint prunes values that cannot satisfy the order
  relative to the other entity's possibilities (standard interval propagation),
  then feeds back into the existing per-category propagation.
- Generation: derive truthful comparatives from the solution; let the palette
  filter decide how many to include.

### 5.4 Termination
Add an attempt cap to `generatePuzzle`; on exhaustion, **relax** the palette one
step (e.g. allow one positive clue on Expert) rather than recursing forever.
Log nothing to the user — it just yields a slightly easier board in the rare
worst case.

---

## 6. Styling / UX / layout decisions to match the app

- All shared chrome (header, stat boxes, buttons, settings sheet, switcher,
  overlay, theme picker, background image, board-opacity slider) is **reused
  verbatim** — no visual divergence from the other four games.
- Grid and clues use **theme tokens** (`--success` ✓, `--error` ✗,
  `--text-muted` `·`, `--accent-dim` highlight, `--surface`/`--surface3` bands)
  so they recolor under all four built-in themes **and** custom themes, and
  respect board opacity + background image via `color-mix`.

### 6.1 Wide-board handling (20 / 25 columns)
- `.header` and `.board-top-bar` keep `max-width:420px`.
- `.board-wrap` gets `overflow-x:auto`; the grid renders at its natural width.
- JS `updateCellSize()` computes `--cell` from `min(availWidth/cols, 34px)`
  clamped to a **min ~26px** so headers stay legible; below that the board pans
  horizontally (Expert), centered on desktop — same approach as Expert
  Minesweeper (`adding-a-game.md` §4 "Adjusting max-width").
- Value column headers use small, clamped, optionally rotated text to keep
  columns narrow.

### 6.2 Clues panel
- Sits above the board (clues are the puzzle; the grid is scratch space).
- Filter-by-entity pills shown only when `cfg.showClueFilter` and N ≥ 4.
- Highlighting a clue tints it; "used" strike-through is a player aid only (no
  effect on logic).

### 6.3 Game-specific settings sections
- *Assists*: **Auto-eliminate** (`#togAutoElim`), **Highlight contradictions
  live** (`#togContra`), **Show clue filter** (`#togClueFilter`).
- *Rules*: **Require no wrong marks to win** (`#togNoWrong`) — when on, stray ✗
  are fine but a wrong ✓ blocks the win (stricter solve).
- Difficulty lives in the top-bar select (not settings), matching Minesweeper.

### 6.4 Intentional deviations (so they read as choices, not bugs)
- Entity-row grid instead of the classic triangular NxN logic grid — chosen for
  mobile width; the deduction content is identical.
- No lose state / no strikes — logic puzzles are not lost, only assisted.
- Timer/Best use the app's `.score-box` + `formatTime` (`m:ss`).

---

## 7. Wire the new game into the suite (the "integrated exactly" part)

1. **`index.html`** — add a 5th `.game-card` after Minesweeper:
   ```html
   <a class="game-card" href="logic.html">
     <span class="emoji">🕵️</span>
     <span class="meta">
       <span class="name">Logic Grid</span>
       <span class="desc">Cross-reference the clues to deduce who's who</span>
     </span>
     <span class="chevron">›</span>
   </a>
   ```
2. **Puzzle switcher dropdown** — add the same 5th option to **all five** game
   pages (`2048.html`, `sudoku.html`, `kakuro.html`, `minesweeper.html`,
   `logic.html`):
   ```html
   <a href="logic.html" class="puzzle-option">🕵️ Logic Grid</a>
   ```
   (`common.js` auto-tags the current page — no JS change.)

---

## 8. Out of scope / future

- **Seeded RNG / shareable puzzle codes** — would let restore store just a seed
  instead of the whole puzzle, and enable "daily" puzzles. Noted, not built.
- **Either/or and conditional clue types** — a natural Expert+ extension once
  comparative clues land.
- **Classic triangular grid view** as an optional layout for tablets/desktop.

---

## 9. Verification

No build system (static HTML/JS/CSS opened directly). Verify by:

- Open `logic.html`; generate each difficulty (4×3, 4×4, 5×4, 5×5). Confirm:
  every generated puzzle is **solvable by logic with no guessing** and has a
  **unique** solution (spot-check by solving; trust `uniqueSolutionCheck`).
- ✓/✗/auto-elim cycling, auto-elim toggle, clue highlight + strike, filter
  pills, Check / Contradictions / Hint, hint counter, reset, win overlay, best-
  time persistence, and **restore after reload** (whole puzzle + marks resume).
- Difficulty select rebuilds the board immediately.
- Easy/Medium fit the 420px width; Hard/Expert pan horizontally; layout holds on
  a narrow mobile viewport.
- Cycle all four themes + a custom theme + background image + opacity slider on
  the grid and clue list; confirm ✓/✗ stay legible on **sakura** (light).
- Switch among all five games via dropdown and home grid; current-page
  highlight works on every page.

---

## 10. Deliverables / commits

1. `css/logic.css`, `js/logic.js`, `logic.html` (new game), with the extended
   `CATEGORY_POOL` / `NAME_POOL` (≥5 each) and `ordinal` flags.
2. Edits to `index.html` + switcher dropdowns in `2048.html`, `sudoku.html`,
   `kakuro.html`, `minesweeper.html`.
3. Commit to `claude/logic-elimination-puzzles-43vb0d` and push. (No PR unless
   requested.)
