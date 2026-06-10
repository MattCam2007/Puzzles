# Kakuro Removed Features

Features that existed in the old Kakuro UI that were removed during the UI parity refactor (aligning with the Sudoku layout). These can be re-introduced individually.

---

## 1. Pause / Resume

**What it did:** The "Status" stat in the stats bar was a tappable button. Tapping it toggled between `Solving` and `Paused`. While paused, the board was blurred (`filter: blur(7px)`) and pointer events were disabled, preventing accidental input.

**Old HTML:** `<div class="stat" id="pauseBtn" role="button">…</div>`  
**Old JS:** `togglePause()` function; `paused` state variable; blur applied to `boardEl`.

---

## 2. Best Time Tracking and Display

**What it did:** The fastest solve time per difficulty + size combination (e.g. `easy-5`, `hard-9`) was stored in `localStorage` under `kakuro_best_v1`. It was displayed in the stats bar as "Best: 1:23" and shown again in the win overlay ("New best time!" or "Best: 1:23").

**Old HTML:** `<div class="stat"><div class="k">Best</div><div class="v accent" id="best">—</div></div>`  
**Old JS:** `getBest()`, `bestKey()`, `showBest()` functions; best-time comparison inside `doWin()`.

---

## 3. Stats Bar (Time / Status / Best row)

**What it was:** A three-column stat strip between the controls and the board showing Time, Status, and Best simultaneously.

**Old HTML:**
```html
<div class="stats">
  <div class="stat">…Time…</div>
  <div class="stat" id="pauseBtn">…Status…</div>
  <div class="stat">…Best…</div>
</div>
```

The Timer now lives in the header score-box (matching Sudoku). Pause and Best time were removed entirely.

---

## 4. Reveal Cell Button

**What it did:** With a cell selected, tapping "Reveal" filled in the correct answer for that specific cell. It first attempted to find a value consistent with the player's other entries (via `K.hint()`); if no consistent value existed, it fell back to the reference solution and warned the player.

**Old HTML:** `<button id="revealBtn" class="warn">…Reveal…</button>` (in `.tools` row)  
**Old JS:** `doReveal()` function.

---

## 5. Auto-Notes Button

**What it did:** Tapping "Auto-notes" computed the full candidate set for every empty white cell (using `K.candidates()`) and wrote those candidates into the notes grid for each cell simultaneously — the equivalent of running pencil-mark logic across the entire board at once.

**Old HTML:** `<button id="autonoteBtn">…Auto-notes…</button>` (in `.tools` row)  
**Old JS:** `doAutoNotes()` function.

---

## 6. Tools Row

**What it was:** A four-button horizontal bar (`grid-template-columns: repeat(4,1fr)`) sitting between the numpad and the bottom bar, containing: Hint, Check, Reveal, Auto-notes — each with an SVG icon and a text label.

In the new layout Hint and Check moved to the board-top-bar (matching Sudoku's Hint / Clear buttons). Reveal and Auto-notes were removed (see above).

---

## 7. Bottom Bar

**What it was:** A persistent bar at the bottom of the page containing "New game" (gradient full-width button), an Undo icon button, and a Settings icon button.

In the new layout "New game" moved to the board-top-bar, Undo moved to the action row (third slot, replacing the Sudoku "Mode" toggle), and Settings moved to the header icon button.

---

## Notes on What Was Kept

The following kakuro-specific features were **retained** despite having no Sudoku equivalent:

- **Combinations modal** — tap any clue cell to see all valid digit combinations for that run. Accessible via cell tap; no dedicated button required.
- **Toast notifications** — brief bottom-centre messages for hints, check results, and tips.
- **Illuminate runs** setting — highlights the across/down run of the selected cell.
- **Dim impossible digits** setting — fades numpad buttons that cannot legally fill the selected cell.
- **Undo** — moved from the bottom bar icon button to the middle slot of the action row.
- **Board size stepper** — moved from the controls section into the board-top-bar left side.
