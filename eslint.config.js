import js from '@eslint/js';

/**
 * Layering rule (target architecture, plans/refactor-and-testing.md §4):
 *   core imports nothing →
 *   theme/ui import only core →
 *   games/X/engine.js + state.js import only core (never core/dom.js) →
 *   render/input/settings import engine + ui + core →
 *   main.js composes.
 */
const browserGlobals = {
  window: 'readonly',
  document: 'readonly',
  Node: 'readonly',
  Storage: 'readonly',
  DOMException: 'readonly',
  localStorage: 'readonly',
  location: 'readonly',
  navigator: 'readonly',
  requestAnimationFrame: 'readonly',
  cancelAnimationFrame: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  FileReader: 'readonly',
  Blob: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  confirm: 'readonly',
  alert: 'readonly',
  getComputedStyle: 'readonly',
};

export default [
  {
    // Legacy pre-refactor monoliths: deleted when the module switchover lands
    // (plans/refactor-and-testing.md, Phase 4).
    ignores: [
      'js/common.js',
      'js/theme.js',
      'js/2048.js',
      'js/sudoku.js',
      'js/kakuro.js',
      'js/theme-builder.js',
    ],
  },
  js.configs.recommended,
  {
    files: ['js/**/*.js', 'tests/**/*.js', 'scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: browserGlobals,
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['js/core/**/*.js'],
    ignores: ['js/core/dom.js'],
    rules: {
      'no-restricted-globals': ['error', 'document', 'window'],
    },
  },
  {
    files: ['js/games/*/engine.js', 'js/games/*/state.js', 'js/games/2048/tile-modes.js'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['**/ui/*', '**/theme/*'], message: 'engine/state may import only core.' },
            { group: ['**/core/dom.js'], message: 'engine/state must stay DOM-free.' },
          ],
        },
      ],
    },
  },
  {
    files: ['js/games/*/engine.js'],
    rules: {
      'no-restricted-globals': ['error', 'document', 'window', 'localStorage'],
    },
  },
  {
    files: ['tests/**/*.js', 'scripts/**/*.mjs'],
    languageOptions: {
      globals: { ...browserGlobals, process: 'readonly', console: 'readonly' },
    },
  },
];
