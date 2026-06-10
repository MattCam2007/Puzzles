const THEMES = [
  { id: 'galaxy',   icon: '🌌', label: 'Galaxy'   },
  { id: 'midnight', icon: '🌊', label: 'Midnight' },
  { id: 'sakura',   icon: '🌸', label: 'Sakura'   },
  { id: 'terminal', icon: '💻', label: 'Terminal' },
];

function applyTheme(id) {
  document.documentElement.setAttribute('data-theme', id);
  localStorage.setItem('puzzle-theme', id);
  syncThemePicker();
}

function loadTheme() {
  const saved = localStorage.getItem('puzzle-theme') || 'galaxy';
  document.documentElement.setAttribute('data-theme', saved);
}

function syncThemePicker() {
  const current = document.documentElement.getAttribute('data-theme') || 'galaxy';
  document.querySelectorAll('[data-theme-pick]').forEach(row => {
    const active = row.dataset.themePick === current;
    row.classList.toggle('selected', active);
    row.onclick = () => applyTheme(row.dataset.themePick);
  });
}

loadTheme();
