/* ============================================================
   Puzzle suite — shared utilities
   Common helpers used across all games. Keep this dependency-free
   so it can be loaded standalone before any game script.
   ============================================================ */

/* ── DOM ── */
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* ── localStorage (JSON-safe) ── */
function loadJSON(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}
function saveJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
}

/* ── time ── */
function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m + ':' + String(s).padStart(2, '0');
}

/* ── history (circular buffer for undo / state replay) ── */
function pushHistory(key, snapshot, limit) {
  if (limit === undefined) limit = 20;
  const history = loadJSON(key, []);
  history.push(snapshot);
  if (history.length > limit) history.splice(0, history.length - limit);
  saveJSON(key, history);
}

/* ── arrays ── */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ── puzzle switcher ── */
(function() {
  const btn  = document.getElementById('puzzleSwitcherBtn');
  const drop = document.getElementById('puzzleDropdown');
  if (!btn || !drop) return;
  const page = location.pathname.split('/').pop() || 'index.html';
  drop.querySelectorAll('.puzzle-option').forEach(function(a) {
    if (a.getAttribute('href') === page) a.classList.add('current');
  });
  btn.addEventListener('click', function(e) {
    e.stopPropagation();
    drop.classList.toggle('show');
  });
  document.addEventListener('click', function() {
    drop.classList.remove('show');
  });
})();
