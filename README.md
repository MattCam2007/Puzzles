# Puzzles

A three-game puzzle suite — **2048**, **Sudoku** and **Kakuro** — plus a **Theme Builder**,
served as static files (GitHub Pages). No framework, no build step: the site ships exactly
the files in this repo, using native ES modules.

## Running locally

ES modules don't load over `file://`, so serve the directory:

```sh
npx serve .
# then open http://localhost:3000
```

## Development

npm is used only for tests and lint — nothing is compiled or bundled for production.

```sh
npm install
npm test            # unit + DOM tests (Vitest)
npm run test:watch  # watch mode
npm run test:coverage
npm run lint        # ESLint (includes the module layering rules)
npm run format      # Prettier check (JS only)
```

## Architecture

```
js/
├── core/      dependency-free utilities (DOM access only in dom.js)
├── ui/        shared DOM components (settings panel, numpad, pick lists, …)
├── theme/     theme tokens, custom themes, background image
├── games/
│   ├── sudoku/   engine.js + state.js (pure) · render / input / settings / main
│   ├── kakuro/   engine.js + state.js (pure) · render / input / settings / main
│   └── 2048/     engine.js + state.js + tile-modes.js (pure) · fx / render / input / main
├── theme-builder/  editor modules
└── pages/     one tiny entry script per HTML page
```

Layering (enforced by ESLint): `core` imports nothing → `theme`/`ui` import only `core` →
`games/*/engine.js` and `state.js` import only `core` (never `core/dom.js`) →
render/input/settings import engine + ui + core → `main.js` composes.

Game engines are pure (no DOM, no localStorage, injectable randomness), so puzzle
generation is deterministic under a seed and pinned by golden-master fixtures in
`tests/golden/`.

See `plans/refactor-and-testing.md` for the full refactor/testing plan and the manual
QA checklist.
