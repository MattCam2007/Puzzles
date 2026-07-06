// Headless-browser smoke suite: boots every page, checks console errors,
// settings, theme persistence, and save/reload round-trips.
//
//   node tests/smoke.test.js          # everything
//   node tests/smoke.test.js sudoku   # only page-suites whose name matches

const http = require('http');
const fs = require('fs');
const path = require('path');

function loadPlaywright() {
  try { return require('playwright'); } catch (e) {}
  const { execSync } = require('child_process');
  const globalRoot = execSync('npm root -g').toString().trim();
  return require(require('path').join(globalRoot, 'playwright'));
}
const { chromium } = loadPlaywright();

const ROOT = path.join(__dirname, '..');
const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml',
};

const NOISE = /net::|Failed to load resource|ERR_/;

let passCount = 0, failCount = 0;
const filterArg = process.argv[2] || '';

function report(name, ok, detail) {
  if (ok) { passCount++; console.log(`✔ ${name}`); }
  else { failCount++; console.log(`✘ ${name}${detail ? ' - ' + detail : ''}`); }
}

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let urlPath = decodeURIComponent(req.url.split('?')[0]);
      if (urlPath === '/') urlPath = '/index.html';
      const filePath = path.join(ROOT, urlPath);
      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        const ext = path.extname(filePath);
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(0, () => resolve(server));
  });
}

async function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout after ${ms}ms: ${label}`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function runPageSuite(browser, baseUrl, name, fn) {
  if (filterArg && !name.includes(filterArg)) return;
  const context = await browser.newContext();
  // The sandbox blocks the Google Fonts @import at the network layer, which
  // otherwise stalls CSSOM (and therefore script execution / load events)
  // for ~13s per navigation. Abort it immediately so navigations stay fast.
  await context.route('https://fonts.googleapis.com/**', (route) => route.abort());
  const page = await context.newPage();
  const errors = [];
  const notFound = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !NOISE.test(msg.text())) {
      errors.push(`console.error: ${msg.text()}`);
    }
  });
  page.on('response', (resp) => {
    const url = resp.url();
    if (resp.status() === 404 && url.startsWith(baseUrl) && !url.endsWith('/favicon.ico')) {
      notFound.push(url);
    }
  });

  try {
    await withTimeout(fn(page, baseUrl, name), 30000, name);
  } catch (e) {
    report(`${name}: suite`, false, e.message);
  }

  if (errors.length) {
    report(`${name}: console/pageerror clean`, false, errors.join('; '));
  } else {
    report(`${name}: console/pageerror clean`, true);
  }
  if (notFound.length) {
    report(`${name}: no same-origin 404s`, false, notFound.join('; '));
  } else {
    report(`${name}: no same-origin 404s`, true);
  }

  await context.close();
}

async function checkSettingsAndTheme(page, name) {
  await page.click('#settingsBtn');
  const shown = await page.evaluate(() => document.getElementById('settingsPanel').classList.contains('show'));
  report(`${name}: settings opens`, shown);

  await page.evaluate(() => document.getElementById('settingsBackdrop').click());
  const hidden = await page.evaluate(() => !document.getElementById('settingsPanel').classList.contains('show'));
  report(`${name}: settings closes`, hidden);

  await page.click('#settingsBtn');
  await page.evaluate(() => document.querySelector('[data-theme-pick="terminal"]').click());
  const themeSet = await page.evaluate(() => document.documentElement.dataset.theme === 'terminal');
  report(`${name}: theme applies`, themeSet);
  await page.evaluate(() => document.getElementById('settingsBackdrop').click());

  await page.reload({ waitUntil: 'domcontentloaded' });
  const themePersisted = await page.evaluate(() => document.documentElement.dataset.theme === 'terminal');
  report(`${name}: theme persists after reload`, themePersisted);
}

async function checkOverlaySanity(page, name, overlaySelector) {
  const notShown = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return el ? !el.classList.contains('show') : false;
  }, overlaySelector);
  report(`${name}: overlay not shown on fresh boot`, notShown);
}

async function checkStateSurvivesReload(page, name, { historyKey, serialize, interact }) {
  await interact(page);
  const before = await page.evaluate(serialize);
  const historyNonEmpty = await page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    if (!raw) return false;
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.length > 0 : !!parsed;
    } catch (e) {
      return raw.length > 0;
    }
  }, historyKey);
  report(`${name}: history key non-empty`, historyNonEmpty);

  await page.reload({ waitUntil: 'domcontentloaded' });
  const after = await page.evaluate(serialize);
  const equal = JSON.stringify(before) === JSON.stringify(after);
  report(`${name}: state survives reload`, equal, equal ? '' : `${JSON.stringify(before)} vs ${JSON.stringify(after)}`);
}

async function checkKeyboardGuardOnSettings(page, name, { serialize, keys, beforeType }) {
  if (beforeType) await page.evaluate(beforeType);
  const before = await page.evaluate(serialize);
  await page.click('#settingsBtn');
  await page.click('#bgImageUrl');
  await page.keyboard.type(keys);
  const inputValue = await page.evaluate(() => document.getElementById('bgImageUrl').value);
  report(`${name}: keyboard guard - text lands in input`, inputValue === keys, `got "${inputValue}"`);
  const after = await page.evaluate(serialize);
  const unchanged = JSON.stringify(before) === JSON.stringify(after);
  report(`${name}: keyboard guard - game state unchanged`, unchanged, unchanged ? '' : `${JSON.stringify(before)} vs ${JSON.stringify(after)}`);
  await page.evaluate(() => { document.getElementById('bgImageUrl').value = ''; });
  await page.evaluate(() => document.getElementById('settingsBackdrop').click());
}

async function main() {
  const server = await startServer();
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const browser = await chromium.launch();

  try {
    await runPageSuite(browser, baseUrl, 'index', async (page) => {
      await page.goto(`${baseUrl}/index.html`, { waitUntil: 'domcontentloaded' });
      const cardCount = await page.evaluate(() => document.querySelectorAll('.game-card').length);
      report('index: 5 game-cards present', cardCount === 5, `got ${cardCount}`);
      const tbLink = await page.evaluate(() => !!document.querySelector('a[href="theme-builder.html"]'));
      report('index: theme-builder link present', tbLink);
    });

    await runPageSuite(browser, baseUrl, 'theme-builder', async (page) => {
      await page.goto(`${baseUrl}/theme-builder.html`, { waitUntil: 'domcontentloaded' });
      const rows = await page.evaluate(() => document.querySelectorAll('.tb-token-row').length);
      report('theme-builder: token rows rendered', rows > 0, `got ${rows}`);
      const slides = await page.evaluate(() => document.querySelectorAll('.tp-slide').length);
      report('theme-builder: preview slides exist', slides >= 1, `got ${slides}`);
    });

    await runPageSuite(browser, baseUrl, '2048', async (page) => {
      const name = '2048';
      await page.goto(`${baseUrl}/2048.html`, { waitUntil: 'domcontentloaded' });
      const tiles = await page.evaluate(() => document.querySelectorAll('#tc .tile').length);
      const bgCells = await page.evaluate(() => document.querySelectorAll('#bgGrid .bg-cell').length);
      report(`${name}: board renders`, tiles >= 2 && bgCells === 16, `tiles=${tiles} bgCells=${bgCells}`);

      await checkOverlaySanity(page, name, '#banner');
      await checkSettingsAndTheme(page, name);

      const serialize2048 = () => {
        const score = document.getElementById('score').textContent;
        const tiles = Array.from(document.querySelectorAll('#tc .tile')).map(t => t.textContent).sort();
        return { score, tiles };
      };

      await checkStateSurvivesReload(page, name, {
        historyKey: '2048-history',
        interact: async (p) => {
          await p.keyboard.press('ArrowLeft');
          await p.waitForTimeout(300);
          await p.keyboard.press('ArrowUp');
          await p.waitForTimeout(300);
          await p.keyboard.press('ArrowRight');
          await p.waitForTimeout(300);
        },
        serialize: serialize2048,
      });

      await checkKeyboardGuardOnSettings(page, name, { serialize: serialize2048, keys: 'wasd' });

      await page.click('#settingsBtn');
      await page.evaluate(() => {
        [...document.querySelectorAll('#tilePicker .pick-row')].find(r => r.textContent.includes('Hex')).click();
      });
      const hexApplied = await page.evaluate(() => [...document.querySelectorAll('#tc .tile')].some(t => t.textContent.startsWith('0x')));
      report(`${name}: tile mode applies`, hexApplied);
      await page.evaluate(() => document.getElementById('settingsBackdrop').click());
      await page.reload({ waitUntil: 'domcontentloaded' });
      const hexPersisted = await page.evaluate(() => [...document.querySelectorAll('#tc .tile')].some(t => t.textContent.startsWith('0x')));
      const cfgTileMode = await page.evaluate(() => JSON.parse(localStorage.getItem('2048-cfg')).tileMode);
      report(`${name}: tile mode persists after reload`, hexPersisted && cfgTileMode === 'hex', `hexPersisted=${hexPersisted} cfgTileMode=${cfgTileMode}`);

      // ends the game — keep last
      await page.evaluate(() => { showOverlay(false); saveHistory(); });
      await page.reload({ waitUntil: 'domcontentloaded' });
      const bannerShown = await page.evaluate(() => document.getElementById('banner').classList.contains('show'));
      const bannerTitle = await page.evaluate(() => document.getElementById('bannerTitle').textContent);
      report(`${name}: game-over state survives reload`, bannerShown && bannerTitle === 'Game Over', `shown=${bannerShown} title="${bannerTitle}"`);
    });

    await runPageSuite(browser, baseUrl, 'sudoku', async (page) => {
      const name = 'sudoku';
      await page.goto(`${baseUrl}/sudoku.html`, { waitUntil: 'domcontentloaded' });
      const cells = await page.evaluate(() => document.querySelectorAll('#board .cell').length);
      const givens = await page.evaluate(() => document.querySelectorAll('#board .given').length);
      report(`${name}: board renders`, cells === 81 && givens > 0, `cells=${cells} givens=${givens}`);

      const dotsDefault = await page.evaluate(() => document.querySelectorAll('#mistakesIndicator .mistake-dot').length);
      report(`${name}: lives dots default to 3`, dotsDefault === 3, `got ${dotsDefault}`);
      await page.click('#settingsBtn');
      await page.click('.strike-opt[data-val="5"]');
      const dotsFive = await page.evaluate(() => document.querySelectorAll('#mistakesIndicator .mistake-dot').length);
      report(`${name}: lives dots follow strike limit`, dotsFive === 5, `got ${dotsFive}`);
      await page.click('.strike-opt[data-val="3"]');
      await page.evaluate(() => document.getElementById('settingsBackdrop').click());

      await checkOverlaySanity(page, name, '#overlay');
      await checkSettingsAndTheme(page, name);

      const serializeSudoku = () => document.getElementById('board').innerText;

      await checkStateSurvivesReload(page, name, {
        historyKey: 'sudoku-history',
        interact: async (p) => {
          await p.click('#numpad .num-btn');
          const target = await p.evaluate(() => {
            const cell = Array.from(document.querySelectorAll('#board .cell:not(.given)'))
              .find(c => c.textContent.trim() === '');
            return cell ? { row: cell.dataset.row, col: cell.dataset.col } : null;
          });
          if (target) {
            await p.click(`#board .cell[data-row="${target.row}"][data-col="${target.col}"]`);
          }
        },
        serialize: serializeSudoku,
      });

      await checkKeyboardGuardOnSettings(page, name, {
        serialize: serializeSudoku,
        keys: '123',
        // force cell-first mode with a cell armed: this is the path where a
        // typed digit actually writes into the board, not just arms a numpad number
        beforeType: () => {
          cfg.inputMode = 'cell';
          const cell = Array.from(document.querySelectorAll('#board .cell:not(.given)'))
            .find(c => c.textContent.trim() === '');
          if (cell) selected = [+cell.dataset.row, +cell.dataset.col];
          applyHighlights();
        },
      });

      // ends the game — keep last
      await page.evaluate(() => { endGame(false); saveGameState(); });
      await page.reload({ waitUntil: 'domcontentloaded' });
      const overlayShown = await page.evaluate(() => document.getElementById('overlay').classList.contains('show'));
      const overlayTitle = await page.evaluate(() => document.getElementById('overlayTitle').textContent);
      report(`${name}: game-over state survives reload`, overlayShown && overlayTitle.includes('Game Over'), `shown=${overlayShown} title="${overlayTitle}"`);
    });

    await runPageSuite(browser, baseUrl, 'kakuro', async (page) => {
      const name = 'kakuro';
      await page.goto(`${baseUrl}/kakuro.html`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.cell.white', { timeout: 10000 });
      const whiteCells = await page.evaluate(() => document.querySelectorAll('.cell.white').length);
      report(`${name}: board renders`, whiteCells > 0, `whiteCells=${whiteCells}`);

      await checkOverlaySanity(page, name, '#overlay');
      await checkSettingsAndTheme(page, name);

      const serializeKakuro = () => document.getElementById('board').innerText;

      await checkStateSurvivesReload(page, name, {
        historyKey: 'kakuro-history',
        interact: async (p) => {
          await p.evaluate(() => document.querySelector('.cell.white').click());
          await p.keyboard.press('5');
        },
        serialize: serializeKakuro,
      });

      await checkKeyboardGuardOnSettings(page, name, { serialize: serializeKakuro, keys: '5' });
    });

    await runPageSuite(browser, baseUrl, 'minesweeper', async (page) => {
      const name = 'minesweeper';
      await page.goto(`${baseUrl}/minesweeper.html`, { waitUntil: 'domcontentloaded' });
      const cells = await page.evaluate(() => document.querySelectorAll('#board .cell').length);
      report(`${name}: board renders`, cells === 256, `cells=${cells}`);

      await checkOverlaySanity(page, name, '#overlay');
      await checkSettingsAndTheme(page, name);

      const serializeMinesweeper = () => document.getElementById('board').innerText;

      await checkStateSurvivesReload(page, name, {
        historyKey: 'minesweeper-history',
        interact: async (p) => {
          await p.evaluate(() => document.querySelectorAll('#board .cell')[0].click());
        },
        serialize: serializeMinesweeper,
      });

      await checkKeyboardGuardOnSettings(page, name, {
        serialize: serializeMinesweeper,
        keys: 'f',
        // point the keyboard cursor at a still-covered cell so 'f' has
        // something to flag if the guard fails to block it
        beforeType: () => {
          const covered = Array.from(cellState).findIndex(v => v === 0);
          if (covered >= 0) cursor = [Math.floor(covered / cols), covered % cols];
        },
      });
    });

    await runPageSuite(browser, baseUrl, 'logic', async (page) => {
      const name = 'logic';
      await page.goto(`${baseUrl}/logic.html`, { waitUntil: 'domcontentloaded' });
      const table = await page.evaluate(() => !!document.querySelector('#board table.logic-grid'));
      const cells = await page.evaluate(() => document.querySelectorAll('td.cell').length);
      report(`${name}: board renders`, table && cells > 0, `table=${table} cells=${cells}`);

      await checkOverlaySanity(page, name, '#overlay');
      await checkSettingsAndTheme(page, name);

      await checkStateSurvivesReload(page, name, {
        historyKey: 'logic-history',
        interact: async (p) => {
          await p.evaluate(() => document.querySelector('td.cell').click());
        },
        serialize: () => document.getElementById('board').innerText,
      });
    });
  } finally {
    await browser.close();
    server.close();
  }

  console.log(`\n${passCount} passed, ${failCount} failed`);
  if (failCount > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
