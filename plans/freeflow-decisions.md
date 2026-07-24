# Free Flow — judgment calls and the generator rewrite

Two passes are recorded here. The first built the game; the second replaced
the board generator after the boards turned out to be solvable but not
*forced*. Read "Why the first generator felt wrong" before changing anything
in `js/freeflow-engine.js` — the current design is shaped almost entirely by
those measurements.

---

## Why the first generator felt wrong

The original generator cut a random Hamiltonian path into k contiguous
segments. That is provably correct — the segments partition the grid, so a
full-coverage solution always exists — and it is what the first version
shipped. It produced boards that were valid, looked right, and did not play
like Flow. Measuring them showed three concrete faults:

**1. The boards were not forced.** This is the big one. Counting
board-filling solutions exactly (25 boards per tier):

| tier | board | unique | median solutions | ≥50 solutions |
|---|---|---|---|---|
| easy | 5×5 | 9/25 | 2 | 0/25 |
| medium | 7×7 | 0/25 | 14 | 2/25 |
| hard | 9×9 | 0/25 | ≥50 | 24/25 |
| expert | 11×11 | 0/25 | ≥50 | 25/25 |

A real Flow board has exactly one solution, which is what makes a move feel
earned: you deduce a route, and it is *the* route. With dozens or hundreds of
solutions there is nothing to deduce — you wiggle pipes until the grid fills
and any of a hundred arrangements is accepted. That is the "doesn't play the
same" feeling, and it is entirely a generation property; no amount of UI work
would have fixed it.

**2. Dots came in kissing pairs.** 94–95% of all dots were orthogonally
touching a dot of a *different* colour, because consecutive segments of one
path always end and begin on neighbouring cells. Dots clustered instead of
spreading. (At these dot densities, random placement alone yields ~70%, so
the excess — not the absolute number — was the tell.)

**3. Connecting every pair left the board half empty.** Taking a straight
shot for each pair covered only 59–81% of the grid, so a player could connect
everything and still be told to go cover 20–40% more. In a real Flow board
the connections themselves force the fill.

Rebuilt, the same measurements now read: **every board uniquely solvable**
(asserted in the test suite for all sizes × difficulties), foreign-dot
adjacency down to 78–92% (near the random-placement baseline for this
density), and straight-shot coverage up to 74–83%.

---

## How the current generator works

`js/freeflow-engine.js`, `generate()`. It runs *backwards* — from an
over-constrained board toward a looser one — because that ordering is what
makes the whole thing affordable.

1. **Over-segment.** Cut a randomized Hamiltonian path into the shortest
   legal flows (3 cells each). A board this tight is essentially always
   forced, and verifying it costs ~2ms even at 11×11.
2. **Merge down.** Repeatedly join two flows whose endpoints touch, keeping
   a merge only when the board still has exactly one solution. Candidates
   are tried shortest-first (merging two stubby flows loosens the board
   least, so the accepted merge usually comes early), and merges are
   verified in batches that halve on failure — the early merges from ~40
   flows down to ~20 essentially never break uniqueness, so checking them
   individually is wasted work.
3. **Stop** at the difficulty's target flow count, at a wall-clock budget, or
   when no merge can preserve uniqueness.

**Why this ordering.** Proving uniqueness on a *loose* board is the one
genuinely expensive operation — a single check on an 11×11 board with 12
flows took up to 34 seconds. Merging down means every check runs on a board
that is already tight, where the solver settles in well under a millisecond.
The expensive direction is never taken.

**Uniqueness is an invariant, not a filter.** Generation starts forced and
only ever accepts merges that keep it forced. Running out of time therefore
costs a few extra colours and never a mushier puzzle, which is what makes a
tight time budget safe.

### The solver

`countSolutions(size, dots, limit, maxNodes)` counts board-filling solutions
exactly. Colours grow one cell at a time from the first dot toward the
second; at each node the colour with the fewest free neighbours is extended,
which is a deterministic function of board state, so every solution is still
enumerated exactly once while forced moves get played before speculative
ones. Three prunes do the work, all following from one observation — an
unfinished colour can only reach free cells by growing from its head, and can
only leave free space by stepping onto its own goal dot:

- a free cell with fewer than two usable neighbours can never be both entered
  and left;
- an unfinished colour's head and goal must share a region of free cells;
- every free region must have some unfinished colour with *both* head and
  goal touching it, or nothing can ever fill it.

`maxNodes` makes the search bounded: it returns `-1` for "could not settle in
budget", which callers must treat as unknown and never as a pass. Declining
an unproven merge is always safe — it just leaves the board more constrained.

### Flow counts are measured, not chosen

A board only stays uniquely solvable down to a certain flow count, and that
floor is a property of board size, not of taste. Measured stall points:
5×5 ≈ 5 flows, 7×7 ≈ 8, 9×9 ≈ 11, 10×10 ≈ 13, 11×11 ≈ 15–18, 12×12 ≈ 18,
13×13 and 14×14 ≈ 23–26. The difficulty targets are set at those floors so
generation stops on arrival instead of paying to rediscover the wall — and
they land in the same range the original game uses anyway. Difficulty is
therefore mostly board size, which is how the real game scales too.

Consequences:

- **Expert is 10×10, not 11×11.** 11×11 cannot be made forced below ~15–18
  flows, and that many colours reads as visual noise rather than difficulty.
  11×11 is still available from the size picker.
- **The size picker caps at 11.** 12×12 can be forced but needs several
  seconds of merging; 13×13 and 14×14 need more colours than a player can
  tell apart. Capping is what lets the generator promise that *every* board
  it returns has exactly one solution.
- **The palette grew to 20 colours.** The last four are only reached on the
  largest boards.

### Generation cost (measured, `tests/` sweep)

| board | flows | forced | avg | worst |
|---|---|---|---|---|
| 5×5 | 5 | 8/8 | 3ms | 7ms |
| 7×7 | 8 | 8/8 | 2ms | 3ms |
| 9×9 | 11–13 | 8/8 | 15ms | 29ms |
| 10×10 | 13–16 | 8/8 | 153ms | 660ms |
| 11×11 | 16–20 | 8/8 | 416ms | 926ms |

---

## Still-open judgment calls

- **Uniqueness is enforced under the fill rule, not the connect-only rule.**
  Flow's actual rule is "connect every pair *and* cover every cell", so that
  is what the solver counts. A board may still admit several ways to connect
  all pairs while leaving cells empty; only one fills the grid. Turning off
  "Fill the whole board" therefore loosens the puzzle by design.
- **Dots still cluster more than a hand-made board.** Foreign-dot adjacency
  sits near the random-placement baseline rather than below it. Adjacent
  dots of different colours are load-bearing here — the merge loop already
  rejected merging them because doing so would break uniqueness — so
  spreading them further would cost forcedness. Left as is.
- **No difficulty knob beyond size.** Since the flow floor is set by board
  size, easy/medium/hard/expert are 5×5/7×7/9×9/10×10. A genuine
  same-size difficulty axis would need a solve-difficulty metric (how deep
  the forced-move chain runs before a guess is needed), which is a much
  bigger piece of work.
- **Generation is synchronous.** 10×10 and 11×11 can block the main thread
  for a few hundred milliseconds on New Game. If that becomes annoying, move
  the engine into a worker rather than loosening the budget.

## Gameplay decisions (unchanged from the first pass)

- **Win = all pairs connected AND every cell covered**, with a settings
  toggle to relax it to connections-only.
- **Pipe rules mirror the original:** drawing over another pipe severs it
  from the crossed cell onward; dots block foreign pipes; dragging backwards
  retracts; touching a dot restarts that flow; touching mid-pipe cuts it
  there; a completed pipe only retracts.
- **Moves** = strokes (or hints) that changed the board. "Perfect" = one
  stroke per flow, no hints.
- **Timer starts on the first stroke.** Best times are bucketed per
  `size×size-difficulty`; hint-assisted solves do not record bests.
- **Undo** (60 strokes) and **Hint** (snaps one flow to the solution —
  now unambiguously *the* solution, since boards are forced).
- **No keyboard input.** Dragging is the game.
- **Win uses the overlay; there is no loss state**, so no banner.
- **Classic board toggle, on by default** — black board, bright classic
  palette, regardless of theme. Off follows the active theme, and light
  themes swap seven palette entries for darker variants.
- **Canvas rendering** rather than DOM cells, redrawn on theme, contrast and
  opacity changes via a MutationObserver on `<html>`.
- **Name/emoji: "Free Flow" / 🌈** — avoids the trademarked name.
