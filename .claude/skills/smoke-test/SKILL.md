---
name: smoke-test
description: Run the headless-browser smoke suite that boots every game,
  checks console errors, settings, theme persistence, and save/reload
  round-trips. Use after ANY change to *.html, css/, or js/ — and before
  every commit during refactors.
---

# Smoke-test the puzzle suite

    node tests/smoke.test.js          # everything
    node tests/smoke.test.js sudoku   # one page-suite (substring match)

Also run the engine tests: `node tests/logic-engine.test.js`.

## Interpreting failures

- `pageerror` → a real JS exception in that game; fix before anything else.
- `state mismatch after reload` → persistence/restore broke.
- Same-origin 404 → a script/css path is wrong.
- `suite - timeout after 30000ms` → a page-suite hung; investigate before
  assuming it's environmental.

## Environment notes

- Playwright resolves from the global npm root; the script handles the
  `require('playwright')` fallback itself.
- Never run `playwright install`; browsers are pre-installed at
  `$PLAYWRIGHT_BROWSERS_PATH`.
- Do not add a `package.json` — this repo has no dependencies by design.
- The Google Fonts `@import` in `css/theme.css` is blocked by the sandbox;
  the script aborts that request at the network layer so navigations stay
  fast. This is expected and not a bug.
