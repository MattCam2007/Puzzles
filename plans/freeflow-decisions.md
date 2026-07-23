# Free Flow — judgment calls made during the build

The request: build Free Flow (connect coloured dots without crossing) in the
style of the existing games, with feature parity, easy/medium/hard/expert,
user-definable board size, and at least one classic-board/classic-colours view.
Ambiguities were resolved with "strong end of medium" / best judgment, per the
request. Each decision below is easy to revisit — file/function pointers included.

## Generation (the load-bearing math)

- **Algorithm: Hamiltonian-path partition.** A serpentine walk of the grid is
  randomized with ~12·n² backbite moves, then cut into k contiguous segments of
  ≥3 cells. Segments partition the grid, so **every board is solvable with 100%
  coverage by construction** — no solver needed, no rejection loop that could
  hang. (`js/freeflow-engine.js`, verified by `tests/freeflow-engine.test.js`,
  664 checks across all sizes × difficulties.)
- **Uniqueness is NOT enforced.** Boards may admit more than one valid
  solution; any non-crossing, all-connected (and, by default, board-filling)
  arrangement wins. Enforcing uniqueness needs an exact solver and heavy
  rejection sampling at 14×14 — deliberately out of scope. Revisit in
  `generate()` if wanted.
- **Flow count = clamp(round(area / targetLen), 3, min(16, area/3))** with
  targetLen 5 / 6.5 / 8 / 10 for easy→expert. Harder = fewer, longer, windier
  flows (matches how the original scales). On big boards the 16-colour palette
  caps the count, so a 14×14 "easy" and "expert" converge somewhat — accepted;
  the alternative is repeating colours.
- **Cosmetic re-sampling:** up to 6 paths × 14 cut samples are scored to avoid
  flows whose two dots sit on adjacent cells and dead-straight flows. Best
  score is accepted even if imperfect, so generation always terminates fast.

## Difficulty & size

- **Auto sizes: easy 5×5, medium 7×7, hard 9×9, expert 11×11.**
- **Board size setting** is a chip row (Auto, 5–14) in Settings; square boards
  only. Rectangular boards would work in the engine with minor changes but the
  suite's boards are square and the classic game is too. An explicit size
  applies to every difficulty; difficulty then only controls flow density.

## Rules

- **Win = all pairs connected AND every cell covered** (default). A settings
  toggle ("Fill the whole board", `cfg.requireFill`) relaxes it to
  connections-only, since players disagree on which rule is "the real one".
  When all pairs connect but cells remain, a toast nudges toward coverage.
- **Pipe interactions mirror the original:** drawing over another pipe severs
  it from the crossed cell onward; dots block foreign pipes; dragging backwards
  retracts; touching a dot restarts that flow; touching mid-pipe cuts it there;
  a completed pipe can only be retracted, not extended.
- **Moves** = strokes (or hints) that changed the board, matching the
  original's counter. "Perfect" = solved in exactly one stroke per flow with no
  hints.

## Feature parity choices

- **Timer starts on the first stroke**, not page load (mirrors Minesweeper's
  first-click start). Best time is stored per `size×size-difficulty` bucket in
  `freeflow-best`; hint-assisted solves don't record bests.
- **Undo** (up to 60 strokes) and **Hint** (snaps one flow to the generated
  solution path, severing anything in the way; counts as a move).
- **No keyboard input.** Dragging is the game; arrow-key pipe-laying felt like
  parity theater. `checkKeyboardGuardOnSettings` is therefore skipped in the
  smoke suite. Easy to add later in `js/freeflow.js` if wanted.
- **Win uses the overlay; there is no loss state**, so no banner.
- Save/restore (`freeflow-history`, limit 2), settings (`freeflow-cfg`),
  puzzle switcher, theme picker, board-opacity slider, outdoor mode, custom
  themes: all wired per `plans/adding-a-game.md`.

## The classic look

- **"Classic board" toggle, ON by default** — black board, subtle light grid
  lines, the classic bright palette (red, green, blue, yellow, orange, cyan,
  pink, maroon, purple, white, grey, lime, tan, navy, teal, rose — 16 colours
  in the classic order). This is the requested "you know the one" view and is
  what a fresh install shows regardless of theme.
- With the toggle OFF the board chrome follows the active theme (background,
  grid lines, border, opacity slider), and on light themes six palette entries
  (white/yellow/cyan/lime/tan/rose) swap to darker variants for contrast.
  Pipes always stay classic-coloured — flows need maximal mutual contrast and
  the theme accent ramp can't provide 16 distinguishable hues.
- **Canvas rendering** (single `<canvas>` in `#board`) rather than DOM cells —
  rounded pipes, glows, and 60fps dragging are impractical with divs. The
  canvas re-reads theme tokens and redraws on theme/contrast/opacity changes
  via a MutationObserver on `<html>`.

## Misc

- **Name/emoji: "Free Flow" / 🌈** — avoids the trademarked name.
- Dot-tap immediately clears that flow's old pipe (the original defers the
  clear until you move); Undo covers accidental taps.
- `CLAUDE.md`'s project-layout list predates Logic Grid and was left as-is
  rather than partially updating it in a feature branch.
