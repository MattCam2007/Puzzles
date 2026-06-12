/* The header ☰ dropdown. Self-wiring on import, exactly as the old
   common.js IIFE was; no-ops on pages without the switcher. */

(function initPuzzleSwitcher() {
  const btn = document.getElementById('puzzleSwitcherBtn');
  const drop = document.getElementById('puzzleDropdown');
  if (!btn || !drop) return;
  const page = location.pathname.split('/').pop() || 'index.html';
  drop.querySelectorAll('.puzzle-option').forEach((a) => {
    if (a.getAttribute('href') === page) a.classList.add('current');
  });
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    drop.classList.toggle('show');
  });
  document.addEventListener('click', () => {
    drop.classList.remove('show');
  });
})();
