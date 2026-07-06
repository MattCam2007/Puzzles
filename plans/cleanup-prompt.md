# Fable cleanup & polish prompt

Hand this to the agent as its task. It is a polish/consolidation pass over an
existing, working codebase — not a rewrite and not a feature pass.

---

You are cleaning up and polishing a small static puzzle suite: vanilla
HTML/CSS/JS, no build step, no framework, no bundler, served as-is via GitHub
Pages. Five games — 2048, Sudoku, Kakuro, Minesweeper, Logic Grid — plus a
theme builder, sharing `js/common.js` and `js/theme.js`. **Read `CLAUDE.md`
first** — it documents the intended architecture and conventions. This codebase
grew organically from one game to five, so expect drift.

## Goal

Leave the suite cleaner, more consistent, more correct, more unified, and more
maintainable — without changing what the games do or how the boards look to a
player. Along the way, upgrade the agent documentation and add a small set of
genuinely useful skills so future work is easier and safer.

## Hard constraints (do not violate)

- **No build step, no framework, no dependencies, no bundler.** It must keep
  working by opening the HTML files directly or via a plain static server.
- **Behavior-preserving gameplay.** No changes to game rules, logic,
  difficulty, or how a game is played. You MAY change shared UI chrome — button
  styling, labels, placement, alignment — as part of the unification goal. You
  may NOT restyle the game boards themselves or touch the theme system. Never
  remove a feature; if unifying would drop a control, keep it.
- **Keep tests green** (`node tests/*.test.js`). Add tests when you extract
  shared logic.
- **Preserve localStorage compatibility**, OR migrate old keys — never silently
  orphan a returning player's saved games, settings, or best scores.

## Work in this order — start with an audit before touching code

### 1. Audit
Skim every file and write a short findings list grouped as: (a) correctness
bugs, (b) duplication / DRY, (c) modularity / structure, (d) performance,
(e) consistency / convention drift, (f) dead code. Rank by payoff-to-risk.
**Show me this list and your intended plan before making large changes.**

### 2. Correctness bugs (highest value first)
Fix real bugs: state that fails to persist or restore, edge cases in game
logic, event-listener or `requestAnimationFrame` leaks, stale-closure bugs,
settings that silently reset. If a fix would change observable gameplay, it's
out of scope — note it instead of doing it.

### 3. UI unification — make the five games feel like one suite
The games already share a header scaffold (`.header` / `.header-right` / puzzle
switcher / settings button), but everything below it has drifted into separate
button classes, labels, and layouts. Unify the **chrome** so moving between
games feels consistent — WITHOUT touching game boards or themes.

- **One button system.** Consolidate the overlapping button classes (`btn
  accent`, `btn-top`, `action-btn`, `btn-primary`, `seg-btn`, `close`, …) into
  a small, documented set with clear roles: primary action, secondary action,
  destructive/danger, icon button, segmented toggle. Every game uses the same
  classes for the same role. Define them once in a shared stylesheet, not
  per-game.
- **Consistent placement & alignment.** Agree on one layout contract for the
  control area — primary "New Game" + difficulty select in the same spot in
  every game, game-specific actions in a consistent toolbar row,
  switcher/settings always in the same corner. Apply it everywhere; align
  spacing, sizing, and gaps so the frame around the board is identical.
- **Consistent labels & affordances.** One casing convention ("New Game"
  everywhere, not "New game"), consistent icon+text style and spacing across
  actions, consistent hover/active/selected states, and the same focus/tap
  feedback for equivalent buttons.
- **One end-game contract.** The win/lose overlay should look and behave the
  same across games (same container pattern, same primary "Play Again" / "New
  Game" treatment). Reconcile 2048's separate `#banner` with the shared
  `#overlay` pattern the other four use, if it can be done without changing
  2048's keep-going behavior.

**Judgment:** the boards are legitimately different and MUST stay that way — a
Sudoku grid and a 2048 board don't converge. Unify the frame around the board,
not the board. If a game genuinely needs a control the others don't
(minesweeper's flag mode, kakuro's grid sizing, logic's layout toggle), keep it
— just give it the same styling and a consistent home. When two games solve the
same need differently, pick the better pattern and make both use it; call out
the choice.

### 4. DRY / modularity
Factor genuinely-repeated logic into `common.js` / `theme.js` or a shared
helper. The per-game settings-panel and theme-picker markup is copy-pasted
across all five HTML files, and each game reimplements the same toggle-wiring /
save-restore / resize / overlay patterns — consolidate where it reduces total
complexity. **Do this alongside step 3** — the button chrome and the settings
panel should become shared the same way, in one pass.

Do NOT over-abstract: a shared helper must be simpler than the duplication it
removes. Games staying independent files is fine and intended. Cleanups that add
indirection without removing complexity are not wins.

### 5. Consistency / conventions
Make storage keys, naming, and file structure follow one convention. `CLAUDE.md`
documents `<game>-best` / `<game>-cfg` / `<game>-history`; at least one game
deviates (e.g. `2048best`). Migrate keys safely so existing saves survive.

### 6. Performance (only where real and measurable)
Unnecessary full re-renders, unbounded particle/animation loops, layout thrash,
repeated DOM queries in hot paths. Don't micro-optimize cold code.

### 7. Polish
Remove dead code and stale comments, tighten obvious rough edges.

## Agent documentation — upgrade it, don't just patch it

`CLAUDE.md` is currently the only agent-facing doc and it has already drifted
from the code (its intro lists four games; there are five). After the cleanup it
will be more stale, because you'll have changed conventions it documents. Treat
the docs as a deliverable:

- **Reconcile with reality.** Every convention the doc states must match the
  code after your changes: button taxonomy, storage-key convention, shared-
  chrome architecture, script load order, full game list, test story. Fix
  existing drift you find.
- **One canonical file, no divergent copies.** Different agent tools look for
  different filenames (`CLAUDE.md` for Claude, `AGENTS.md` as the emerging
  cross-tool standard, etc.). Pick ONE as the single source of truth
  (`AGENTS.md` is the portable choice) and make the other a thin pointer to it —
  a symlink or a one-line "see AGENTS.md". Never maintain two full copies that
  can diverge.
- **Raise the altitude.** The current doc is mostly copy-paste recipes. Keep the
  useful recipes, but add what an agent actually needs and can't infer: the
  invariants/contracts (e.g. "never write `puzzle-*` keys from game JS", the
  settings-panel id contract, the shared button roles), the intentional
  non-goals (games are separate files on purpose; boards/themes are not
  unified), a short "gotchas / sharp edges" section, and how to verify a change
  (tests + how to smoke-test each game). Where a recipe is now automated by a
  skill, point to the skill instead of the manual steps.
- **Keep it honest and current.** If you change something, update the doc in the
  same commit. A doc that lies is worse than no doc.

## Skills — write reusable skills for the recurring, error-prone tasks

Several tasks here are mechanical, multi-file, and easy to get subtly wrong —
exactly what skills are for. Author a small set of genuinely useful skills in the
repo's skills format (a `SKILL.md` per skill, plus any helper script), each
scoped, self-contained, and **verified to actually work before you commit it.**
Prioritize by how much pain they remove:

- **smoke-test / verify-suite (highest priority — build this early).** The suite
  has almost no automated tests (only the logic engine). Write a skill that
  loads every game in a headless browser (Playwright is available in this
  environment) and asserts each one starts, renders its board, survives a reload
  with state intact, and logs zero console errors. This is the safety net that
  makes the rest of the refactor safe to do.
- **add-theme.** Adding a theme today means ~7 manual steps editing `theme.css`,
  `theme.js`, every game's HTML, 2048's tile colors, and light-theme overrides —
  miss one file and it's broken. A skill should apply all edits consistently (or
  generate them and flag the spots). Even more valuable after the
  settings-panel/pick-row markup is shared.
- **add-game.** There's already a long plan (`plans/adding-a-game.md`). Turn the
  reliable parts into a skill that stamps out the HTML/CSS/JS skeleton wired to
  the shared chrome, the switcher entry in every game, and the storage-key
  setup — following the unified conventions.
- Consider smaller ones (add-setting-toggle, add-difficulty) only if they clearly
  pay off. Fewer, higher-quality skills beat a pile of thin ones.

For each skill: write a clear description of when to use it, keep it aligned with
the unified conventions, verify it end-to-end, and reference it from the agent
doc so it's discoverable. If a skill encodes a convention, that convention must
also be stated in the doc — skill and doc agree.

## Agents — create a model-tiered roster (opencode format)

Create a set of purpose-built agents as opencode agent files (project-level:
`.opencode/agent/<name>.md`). Each file is Markdown with YAML frontmatter and a
system-prompt body:

```markdown
---
description: >-
  One or two sentences on exactly when to use this agent. opencode uses this to
  route work, so be specific about the job and its boundaries.
mode: subagent            # primary = orchestrates; subagent = invoked by others
model: anthropic/claude-haiku-4-5   # provider/model slug — verify against the
                                    # user's configured providers / models.dev
temperature: 0.1
tools:                    # least privilege: only what the job needs
  write: false
  edit: true
  bash: true
permission:
  edit: allow
  bash: ask
---

You are <role>. <Scope, method, what to do, what NOT to do, when to escalate.>
```

**Design principle — the expensive model decides, cheap models apply.** Pay the
top tier once for auditing, architecture, and review; push fully-specified,
mechanical, repetitive work down to the cheapest model that can do it reliably.
Split a job into its own agent only when that split is both *possible* (the work
is separable and well-scoped) and *meaningful* (it lets a cheaper model do work
the expensive one would otherwise do, or it earns a tighter tool/permission
scope). Don't manufacture agents that don't change the model tier or the
privilege boundary.

**Model tiers, cheapest → most expensive:** Z.AI/GLM (cheapest; good for
fully-specified low-judgment work) → Haiku → Sonnet → Opus → **Fable (premium,
metered API credits — most expensive)**. Use exact `provider/model` slugs from
the user's configured providers (look them up; don't guess).

**Fable is a paid, on-demand escalation tier, never a default.** The user pays
per-call API credits for Fable, so it must NOT be the `model:` on any agent that
gets invoked automatically or routinely — that silently burns money. Opus is the
durable default top tier; Fable sits one notch above it and is spent
deliberately.

- **When to use Fable — only for make-or-break reasoning where a wrong answer is
  expensive to unwind:** the one-shot architecture decision (final button
  taxonomy + shared-chrome contract), or a specific bug/refactor that Opus has
  genuinely tried and stalled on. A handful of calls across the whole project,
  not a workflow.
- **When NOT to use Fable — basically everywhere else:** implementation,
  mechanical edits, verification, docs, exploration, or "just to be safe." Those
  never touch Fable. If Opus can do it, Opus does it.
- **How to use it cost-efficiently:** put it behind ONE dedicated escalation
  agent (below), `mode: subagent`, invoked explicitly by the user or by planner
  only with a stated justification. Hand it a distilled, tightly-scoped problem
  statement and the minimum context needed — do NOT let it re-read the repo or
  explore. You are paying premium rates for the reasoning token, so feed it the
  decision, not the discovery. It returns a decision; cheaper agents apply it.

Give each agent **least-privilege tools**: read-only agents get no `write`/`edit`
(audit, verify); appliers get `edit` but stay tightly scoped by their prompt;
reserve broad `bash`/permission for the agents that truly need it.

Recommended roster (adjust names/count to what's meaningful — merging two is
fine if the split buys nothing):

| Agent | Mode | Tier | Job | Tools posture |
|---|---|---|---|---|
| **fable-oracle** | subagent | **Fable** (premium; invoke by hand only) | The paid escalation tier. Answers ONE distilled, high-stakes reasoning question at a time — the final architecture/taxonomy call, or a problem Opus stalled on. Not auto-routed; the user or planner invokes it deliberately with a stated reason and pre-distilled context. Returns a decision, doesn't implement. | read only; **no edit/write/bash** — it reasons, it doesn't do |
| **planner** | primary | **Opus** (durable default top tier) | Where you spend by default. Runs the audit, ranks findings, designs the button taxonomy / layout contract / shared-chrome architecture, delegates to subagents, reviews risky diffs, and decides when a question is worth escalating to fable-oracle. Thinks and reviews — rarely types. | read + plan; little/no direct editing |
| **bug-hunter** | subagent | **Sonnet** | Find and fix correctness bugs (persistence/restore, leaks, edge cases). Real code reasoning, but Sonnet-grade; escalate genuinely gnarly ones to planner. | read + edit (js) |
| **refactorer** | subagent | **Sonnet** | Implement the DRY consolidation and UI unification against the planner's spec: shared button system, shared settings-panel/chrome, extracted helpers. | read + edit (html/css/js) |
| **sweeper** | subagent | **Haiku** (or Z.AI/GLM for the most mechanical batches) | The workhorse that keeps you off expensive models. Applies fully-decided, repetitive edits across many files: button-class renames, label casing, storage-key migration, dead-code deletion. The thinking is already done; it just applies it precisely and consistently. | read + edit, tightly scoped |
| **skill-author** | subagent | **Sonnet** | Write and verify the skills (smoke-test with Playwright, add-theme, add-game). | read + edit + bash |
| **docs-scribe** | subagent | **Z.AI/GLM** (or Haiku) | Reconcile the agent doc, skill descriptions, and README prose to match the final code. Well-specified writing at a low judgment bar. | read + edit (docs only) |
| **verifier** | subagent | **Z.AI/GLM** or **Haiku** | Run the tests and the smoke-test skill, load each game, report console errors and state-persistence results. Executes and reports; never edits. | read + bash; **no edit/write** |

Net effect to aim for: Fable is spent on only a handful of make-or-break
reasoning calls; Opus handles the routine audit, architecture, and review;
Sonnet does implementation that needs judgment; Haiku/GLM do the high-volume
mechanical edits, verification, and doc reconciliation. Wire the subagents so the
planner can delegate to them, keep fable-oracle off any automatic path (it costs
real money per call), and make sure the cheap appliers are constrained enough (by
prompt and by tool scope) that a smaller model can't wander outside its lane.

## Rules of engagement

- Prefer many small, self-contained, reviewable commits over one giant diff.
  Each commit message says what changed and why it's behavior-preserving.
- After each meaningful change, verify: run the tests, and load each affected
  game to confirm it still starts, plays, persists across reload, and logs no
  console errors. (Once the smoke-test skill exists, use it.) Report what you
  actually verified.
- If you find something that looks like a bug but fixing it would change
  behavior, or a refactor that needs a judgment call, STOP and ask rather than
  guessing.
- If you change a documented convention or shared contract, update the doc in
  the same commit.
- Bias toward the smallest change that removes the most confusion.

## Deliver

1. The audit / plan up front.
2. The changes as incremental commits (bugs → UI unification + DRY →
   consistency → perf → polish), with docs updated alongside.
3. The upgraded agent doc, the new skills, and the opencode agent roster — each
   verified. Default agents pinned to durable tiers (Opus and below); Fable used
   only on the dedicated, hand-invoked escalation agent.
4. A short summary: what you fixed, what you deliberately left alone (and why),
   and anything risky you want a human to look at.
