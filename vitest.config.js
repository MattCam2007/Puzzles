// Node env for pure engines; DOM-touching test files opt into jsdom with a
// `// @vitest-environment jsdom` pragma at the top of the file.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      // Coverage is a floor for the pure layer, not a goal in itself.
      // render/input/fx/pages are visual or composition glue — exercised by
      // the manual QA checklist (plans/refactor-and-testing.md §10) instead.
      include: [
        'js/core/**',
        'js/theme/**',
        'js/games/*/engine.js',
        'js/games/*/state.js',
        'js/games/2048/tile-modes.js',
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        statements: 90,
        branches: 80,
      },
    },
  },
});
