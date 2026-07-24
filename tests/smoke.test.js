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
      report('index: 6 game-cards present', cardCount === 6, `got ${cardCount}`);
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

    await runPageSuite(browser, baseUrl, 'abacus', async (page) => {
      const name = 'abacus';
      await page.goto(`${baseUrl}/abacus.html`, { waitUntil: 'domcontentloaded' });
      // default style is soroban: 9 rods × (1 heaven + 4 earth) beads
      const beads = await page.evaluate(() => document.querySelectorAll('#board .bead').length);
      report(`${name}: board renders`, beads === 45, `beads=${beads}`);

      await checkOverlaySanity(page, name, '#overlay');
      await checkSettingsAndTheme(page, name);

      const serializeAbacus = () =>
        JSON.stringify(rodState) + '|' +
        document.getElementById('questionText').textContent + '|' +
        document.getElementById('readout').textContent;

      await checkStateSurvivesReload(page, name, {
        historyKey: 'abacus-history',
        interact: async (p) => {
          await p.evaluate(() => document.querySelector('#board .bead').click());
        },
        serialize: serializeAbacus,
      });

      await page.click('#settingsBtn');
      await page.evaluate(() => document.querySelector('[data-abacus-pick="schoty"]').click());
      const schotyBeads = await page.evaluate(() => document.querySelectorAll('#board .srow .bead').length);
      report(`${name}: abacus style applies`, schotyBeads === 70, `got ${schotyBeads}`);
      await page.evaluate(() => document.getElementById('settingsBackdrop').click());
      await page.reload({ waitUntil: 'domcontentloaded' });
      const cfgStyle = await page.evaluate(() => JSON.parse(localStorage.getItem('abacus-cfg')).style);
      const schotyAfter = await page.evaluate(() => document.querySelectorAll('#board .srow .bead').length);
      report(`${name}: abacus style persists after reload`, cfgStyle === 'schoty' && schotyAfter === 70,
        `style=${cfgStyle} beads=${schotyAfter}`);

      // D1 regression: an orphaned checkAnswer() advance timer must not
      // fire after New Game and silently swap the question the user is
      // now looking at.
      const d1 = await page.evaluate(async () => {
        cfg.style = 'soroban'; cfg.mode = 'practice'; cfg.requireCheck = true; saveCfg();
        startGame();
        const S = E.STYLES[cfg.style];
        String(question.answer).padStart(S.rods, '0').split('').forEach((d, i) => {
          d = +d; rodState[i] = { h: d >= 5 ? 1 : 0, e: d % 5 };
        });
        renderBeads();
        checkAnswer(); // starts the 800ms advance timer
        startGame();   // simulates hitting New Game immediately
        const qAfterNewGame = question.text;
        await new Promise(r => setTimeout(r, 1000)); // let the old timer's window pass
        return { qAfterNewGame, qNow: question.text };
      });
      report(`${name}: D1 new-game survives pending advance timer`,
        d1.qAfterNewGame === d1.qNow, `${d1.qAfterNewGame} -> ${d1.qNow}`);

      // Kinetic beads (A8-A12): freestyle soroban, ones-place rod (last
      // rod). Earth beads' wall is at the TOP of the earth zone (nearest
      // the beam), so moving the pointer UP (decreasing y) activates them.
      // Grab the farthest earth bead (index 3, resting at 4*beadH since
      // inactive) and drag it up by 1.5*beadH, landing at track position
      // 2.5*beadH -> quantizes to count 3. Beads 0-1-2 all have to be
      // carried along in the same gesture for that to happen.
      await page.setViewportSize({ width: 1280, height: 800 });
      const geom = await page.evaluate(() => {
        cfg.mode = 'freestyle'; cfg.style = 'soroban'; saveCfg();
        rodState = freshState(); buildAbacus(); updateReadout();
        const rod = document.querySelectorAll('.rod')[8]; // ones place
        const beads = rod.querySelectorAll('.bead'); // [heaven0, earth0..earth3]
        const b3 = beads[4].getBoundingClientRect(); // earth bead index 3 (farthest)
        return { x: b3.left + b3.width / 2, y0: b3.top + b3.height / 2, beadH: b3.height };
      });

      // deliberate, paced drag toward the wall (real waits between steps,
      // since Playwright's `steps` interpolates position but not real
      // time — without pacing, every synthetic drag reads as a flick)
      await page.mouse.move(geom.x, geom.y0);
      await page.mouse.down();
      const target = geom.y0 - 1.5 * geom.beadH;
      for (let i = 1; i <= 10; i++) {
        await page.mouse.move(geom.x, geom.y0 + (target - geom.y0) * (i / 10));
        await page.waitForTimeout(20);
      }
      const midValue = await page.evaluate(() => abacusValue());
      report(`${name}: A8 value updates live during drag (before mouseup)`, midValue > 0, `midValue=${midValue}`);

      await page.mouse.up();
      const afterDrag = await page.evaluate(() => ({ e: rodState[8].e, v: abacusValue() }));
      report(`${name}: A10 dragging the farthest bead toward the wall shoves beads 0-1-2 along with it (one gesture -> count 3)`,
        afterDrag.e === 3 && afterDrag.v === 3, `e=${afterDrag.e} v=${afterDrag.v}`);

      // A9: a plain tap (zero-distance press) still toggles a bead using
      // the original prefix rule — grab the same rod's heaven bead
      const heavenGeom = await page.evaluate(() => {
        cfg.style = 'soroban'; saveCfg();
        rodState = freshState(); buildAbacus(); updateReadout();
        const rod = document.querySelectorAll('.rod')[8];
        const b = rod.querySelectorAll('.bead')[0].getBoundingClientRect(); // heaven bead
        return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
      });
      await page.mouse.move(heavenGeom.x, heavenGeom.y);
      await page.mouse.down();
      await page.mouse.up(); // zero-distance press = tap
      const afterTap = await page.evaluate(() => ({ h: rodState[8].h, v: abacusValue() }));
      report(`${name}: A9 a plain tap still toggles the bead`, afterTap.h === 1 && afterTap.v === 5,
        `h=${afterTap.h} v=${afterTap.v}`);

      // A12: after release, adjacent beads within the same group (heaven,
      // earth) must be spaced an exact multiple of the unit apart — no
      // bead left visually between slots. (Spacing *across* the
      // heaven/earth boundary isn't a clean multiple by design: there's a
      // fixed beam-height gap between the two zones.)
      const snapCheck = await page.evaluate(() => {
        const rod = document.querySelectorAll('.rod')[8];
        const uPx = parseFloat(getComputedStyle(document.getElementById('board')).getPropertyValue('--u'));
        const beads = [...rod.querySelectorAll('.bead')];
        const heavenTops = beads.slice(0, 1).map(b => parseFloat(getComputedStyle(b).top));
        const earthTops = beads.slice(1).map(b => parseFloat(getComputedStyle(b).top));
        const spacingOk = (tops) => {
          for (let i = 0; i < tops.length - 1; i++) {
            const diff = Math.abs(tops[i + 1] - tops[i]);
            if (Math.abs(diff / uPx - Math.round(diff / uPx)) > 0.02) return false;
          }
          return true;
        };
        return { ok: spacingOk(heavenTops) && spacingOk(earthTops), heavenTops, earthTops, uPx };
      });
      report(`${name}: A12 every bead snaps to an exact multiple of the unit within its group`, snapCheck.ok,
        JSON.stringify(snapCheck));

      // A11: a fast flick — small nominal distance, but covered in a
      // single near-instant jump (high velocity) — sweeps the whole
      // group toward the wall, further than plain quantization of that
      // same small distance would reach on its own.
      const flickGeom = await page.evaluate(() => {
        cfg.style = 'soroban'; saveCfg();
        rodState = freshState(); buildAbacus(); updateReadout();
        const rod = document.querySelectorAll('.rod')[8];
        const b0 = rod.querySelectorAll('.bead')[1].getBoundingClientRect(); // earth bead 0
        return { x: b0.left + b0.width / 2, y0: b0.top + b0.height / 2, beadH: b0.height };
      });
      await page.mouse.move(flickGeom.x, flickGeom.y0);
      await page.mouse.down();
      // moving UP (toward the earth wall) by a distance that alone would
      // still only quantize to 1 (round(1.2)=1), covered in one jump so
      // the measured velocity is comfortably above the fling threshold
      // even under CI timing jitter
      await page.mouse.move(flickGeom.x, flickGeom.y0 - 1.2 * flickGeom.beadH, { steps: 1 });
      await page.mouse.up();
      const afterFlick = await page.evaluate(() => rodState[8].e);
      report(`${name}: A11 fast flick sweeps past what plain quantization of the same distance would reach`,
        afterFlick > 1, `e=${afterFlick} (plain quantization of this distance alone would give 1)`);

      // A16: in the default mode (practice, requireCheck off), no Check
      // button is visible, and setting the correct value auto-advances
      // with no click at all.
      const a16 = await page.evaluate(async () => {
        cfg.mode = 'practice'; cfg.requireCheck = false; saveCfg();
        startGame();
        const checkHidden = document.getElementById('checkBtn').classList.contains('hidden');
        const before = question.text;
        const S = E.STYLES[cfg.style];
        String(question.answer).padStart(S.rods, '0').split('').forEach((d, i) => {
          d = +d; rodState[i] = { h: d >= 5 ? 1 : 0, e: d % 5 };
        });
        onBeadMoved(); // simulates the last bead release of a drag/tap, no click on any button
        await new Promise(r => setTimeout(r, 600)); // past the 450ms auto-check debounce
        return { checkHidden, advanced: question.text !== before };
      });
      report(`${name}: A16 Check button hidden by default`, a16.checkHidden);
      report(`${name}: A16 correct value auto-advances with no click`, a16.advanced);

      // A17: an existing v1 config (saved before requireCheck/migrateCfg
      // existed) must migrate on load without ever showing a Check button.
      await page.evaluate(() => {
        localStorage.setItem('abacus-cfg', JSON.stringify({ difficulty: 'easy', mode: 'flow', style: 'soroban' }));
      });
      await page.reload({ waitUntil: 'domcontentloaded' });
      const a17 = await page.evaluate(() => ({
        checkHidden: document.getElementById('checkBtn').classList.contains('hidden'),
        mode: cfg.mode, requireCheck: cfg.requireCheck,
      }));
      report(`${name}: A17 v1 cfg migrates without showing a Check button`,
        a17.checkHidden && a17.mode === 'practice' && a17.requireCheck === false, JSON.stringify(a17));

      // A13/A14: every shape x material combination renders a nonzero,
      // correctly-tagged bead for every style, including 'auto' shape
      // resolving to each style's traditional default.
      const combos = await page.evaluate(() => {
        const out = [];
        for (const style of ['soroban', 'suanpan', 'roman', 'schoty']) {
          for (const shape of E.SHAPES.map(s => s.id)) {
            for (const material of E.MATERIALS.map(m => m.id)) {
              cfg.style = style; cfg.beadShape = shape; cfg.beadMaterial = material; saveCfg();
              rodState = freshState(); buildAbacus(); updateReadout();
              const board = document.getElementById('board');
              const bead = document.querySelector('.bead');
              const rect = bead ? bead.getBoundingClientRect() : { width: 0, height: 0 };
              const resolved = E.resolveBeadShape(style, shape);
              if (board.dataset.beadShape !== resolved || rect.width <= 0 || rect.height <= 0) {
                out.push(`${style}/${shape}/${material}: tag=${board.dataset.beadShape} expected=${resolved} w=${rect.width} h=${rect.height}`);
              }
            }
          }
        }
        return out;
      });
      report(`${name}: A13/A14 every style x shape x material renders correctly-tagged, nonzero beads`,
        combos.length === 0, combos.slice(0, 5).join(' | '));

      // A15: bead shape, bead material and frame all persist across reload
      await page.evaluate(() => {
        cfg.style = 'suanpan'; cfg.beadShape = 'faceted'; cfg.beadMaterial = 'jade'; cfg.frame = 'rosewood';
        saveCfg(); rodState = freshState(); buildAbacus(); updateReadout();
      });
      await page.reload({ waitUntil: 'domcontentloaded' });
      const a15 = await page.evaluate(() => {
        const board = document.getElementById('board');
        return {
          cfgShape: cfg.beadShape, cfgMaterial: cfg.beadMaterial, cfgFrame: cfg.frame,
          domShape: board.dataset.beadShape, domMaterial: board.dataset.beadMaterial, domFrame: board.dataset.frame,
        };
      });
      report(`${name}: A15 bead shape/material/frame persist across reload`,
        a15.cfgShape === 'faceted' && a15.cfgMaterial === 'jade' && a15.cfgFrame === 'rosewood' &&
        a15.domShape === 'faceted' && a15.domMaterial === 'jade' && a15.domFrame === 'rosewood',
        JSON.stringify(a15));
    });

    await runPageSuite(browser, baseUrl, 'abacus-layout', async (page) => {
      const name = 'abacus-layout';
      await page.goto(`${baseUrl}/abacus.html`, { waitUntil: 'domcontentloaded' });

      const viewports = [[844, 390], [390, 844], [1280, 800]];
      const styles = ['soroban', 'suanpan', 'roman', 'schoty'];

      for (const style of styles) {
        for (const [w, h] of viewports) {
          await page.setViewportSize({ width: w, height: h });
          await page.evaluate((s) => {
            cfg.style = s; saveCfg();
            rodState = freshState();
            buildAbacus();
            updateReadout();
          }, style);
          await page.waitForTimeout(80);

          const m = await page.evaluate(() => {
            const ab = document.querySelector('.abacus').getBoundingClientRect();
            const wrap = document.querySelector('.board-wrap');
            const beads = [...document.querySelectorAll('.bead')];
            const minBead = beads.length
              ? Math.min(...beads.map(b => { const r = b.getBoundingClientRect(); return Math.min(r.width, r.height); }))
              : 0;
            return {
              pct: (ab.width * ab.height) / (innerWidth * innerHeight) * 100,
              pageScroll: document.documentElement.scrollHeight - innerHeight,
              hScrollWrap: wrap.scrollWidth - wrap.clientWidth,
              minBead,
            };
          });
          const label = `${style}@${w}x${h}`;

          // A1/A3: zero scroll in either axis
          report(`${name}: ${label} no page scroll`, m.pageScroll <= 1, `pageScroll=${m.pageScroll}`);
          report(`${name}: ${label} no horiz scroll in board-wrap`, m.hScrollWrap <= 0, `hScroll=${m.hScrollWrap}`);

          // A2/A4/A5: 844x390 and 1280x800 need >=55%; 390x844 (portrait phone) needs >=40%
          const isPortraitPhone = (w === 390 && h === 844);
          const threshold = isPortraitPhone ? 40 : 55;
          report(`${name}: ${label} area >= ${threshold}%`, m.pct >= threshold, `pct=${m.pct.toFixed(1)}`);

          // A7: smallest interactive bead dimension >= 28px, at 844x390 only
          if (w === 844 && h === 390) {
            report(`${name}: ${label} bead >= 28px`, m.minBead >= 28, `minBead=${m.minBead.toFixed(1)}`);
          }
        }
      }
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
