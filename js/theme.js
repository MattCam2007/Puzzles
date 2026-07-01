const THEMES = [
  { id: 'galaxy',   icon: '🌌', label: 'Galaxy'   },
  { id: 'midnight', icon: '🌊', label: 'Midnight' },
  { id: 'sakura',   icon: '🌸', label: 'Sakura'   },
  { id: 'terminal', icon: '💻', label: 'Terminal' },
];

const BG_KEY            = 'puzzle-bg-image';
const ALPHA_KEY         = 'puzzle-board-alpha';
const CUSTOM_THEMES_KEY = 'puzzle-custom-themes';

function _hexToRgb(hex) {
  if (!hex || hex.length < 7) return '0, 0, 0';
  return `${parseInt(hex.slice(1,3),16)}, ${parseInt(hex.slice(3,5),16)}, ${parseInt(hex.slice(5,7),16)}`;
}

function _esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function loadCustomThemes() {
  try { return JSON.parse(localStorage.getItem(CUSTOM_THEMES_KEY) || '[]'); }
  catch { return []; }
}

function saveCustomThemesToStorage(themes) {
  localStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify(themes));
}

function _injectCustomTheme(theme) {
  let el = document.getElementById('custom-theme-style');
  if (!theme) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement('style'); el.id = 'custom-theme-style'; document.head.appendChild(el); }
  const t  = theme.tokens;
  const ar  = _hexToRgb(t['--accent']  || '#000000');
  const a2r = _hexToRgb(t['--accent2'] || '#000000');
  const lines = Object.entries(t).map(([k,v]) => `  ${k}: ${v};`).join('\n');
  el.textContent = `html[data-theme="${theme.id}"] {\n${lines}\n  --accent-rgb: ${ar};\n  --accent2-rgb: ${a2r};\n  --accent-dim: rgba(${ar}, 0.18);\n  --accent-dim2: rgba(${a2r}, 0.12);\n}`;
}

function applyBoardAlpha(value) {
  document.documentElement.style.setProperty('--board-alpha', `${value}%`);
  localStorage.setItem(ALPHA_KEY, value);
}

function loadBoardAlpha() {
  const saved = localStorage.getItem(ALPHA_KEY);
  document.documentElement.style.setProperty('--board-alpha', `${saved !== null ? parseInt(saved) : 100}%`);
}

function applyTheme(id) {
  if (id && id.startsWith('custom-')) {
    _injectCustomTheme(loadCustomThemes().find(t => t.id === id) || null);
  } else {
    _injectCustomTheme(null);
  }
  document.documentElement.setAttribute('data-theme', id || 'galaxy');
  localStorage.setItem('puzzle-theme', id || 'galaxy');
  syncThemePicker();
}

function loadTheme() {
  const saved = localStorage.getItem('puzzle-theme') || 'galaxy';
  if (saved.startsWith('custom-')) {
    _injectCustomTheme(loadCustomThemes().find(t => t.id === saved) || null);
  }
  document.documentElement.setAttribute('data-theme', saved);
}

function applyBgImage(value) {
  if (value) {
    document.documentElement.style.setProperty('--bg-image', `url(${JSON.stringify(value)})`);
    try { localStorage.setItem(BG_KEY, value); } catch(e) {}
  } else {
    document.documentElement.style.removeProperty('--bg-image');
    localStorage.removeItem(BG_KEY);
  }
}

function loadBgImage() {
  const saved = localStorage.getItem(BG_KEY);
  if (saved) applyBgImage(saved);
}

function _readAndApply(file) {
  const reader = new FileReader();
  reader.onload = e => {
    applyBgImage(e.target.result);
    const u = document.getElementById('bgImageUrl');
    if (u) { u.value = ''; u.placeholder = 'Paste image URL…'; }
    syncThemePicker();
  };
  reader.readAsDataURL(file);
}

async function _pickImageFile() {
  if (window.showOpenFilePicker) {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: 'Images', accept: { 'image/*': ['.jpg','.jpeg','.png','.gif','.webp','.bmp','.avif','.svg'] } }],
        multiple: false,
      });
      _readAndApply(await handle.getFile());
    } catch(e) {}
  } else {
    const f = document.getElementById('bgImageFile');
    if (f) f.click();
  }
}

function syncThemePicker() {
  const current = document.documentElement.getAttribute('data-theme') || 'galaxy';

  document.querySelectorAll('[data-theme-pick]').forEach(row => {
    const active = row.dataset.themePick === current;
    row.classList.toggle('selected', active);
    row.onclick = () => applyTheme(row.dataset.themePick);
  });

  const customList = document.getElementById('customThemesList');
  if (customList) {
    const customs = loadCustomThemes();
    customList.innerHTML = customs.map(t =>
      `<div class="pick-row${t.id === current ? ' selected' : ''}" data-custom-pick="${t.id}">` +
      `<span class="pick-icon">${_esc(t.icon || '🎨')}</span>${_esc(t.label)}<span class="pick-check">✓</span></div>`
    ).join('');
    customList.querySelectorAll('[data-custom-pick]').forEach(row => {
      row.onclick = () => applyTheme(row.dataset.customPick);
    });
  }

  const saved = localStorage.getItem(BG_KEY);
  const hasBg = !!saved;
  const isUpload = hasBg && saved.startsWith('data:');

  const uploadRow = document.getElementById('bgUploadRow');
  if (uploadRow) {
    uploadRow.classList.toggle('selected', isUpload);
    uploadRow.onclick = () => _pickImageFile();
  }

  const clearBtn = document.getElementById('clearBgBtn');
  if (clearBtn) {
    clearBtn.classList.toggle('selected', !hasBg);
    clearBtn.onclick = () => {
      applyBgImage(null);
      const u = document.getElementById('bgImageUrl');
      if (u) { u.value = ''; u.placeholder = 'Paste image URL…'; }
      const f = document.getElementById('bgImageFile');
      if (f) f.value = '';
      syncThemePicker();
    };
  }

  const fileInput = document.getElementById('bgImageFile');
  if (fileInput) {
    fileInput.onchange = () => {
      const file = fileInput.files[0];
      if (!file) return;
      _readAndApply(file);
      fileInput.value = '';
    };
  }

  const urlInput = document.getElementById('bgImageUrl');
  if (urlInput) {
    urlInput.value = (saved && !isUpload) ? saved : '';
    urlInput.placeholder = isUpload ? 'Image uploaded ✓' : 'Paste image URL…';
    urlInput.onchange = () => {
      const v = urlInput.value.trim();
      applyBgImage(v || null);
      const f = document.getElementById('bgImageFile');
      if (f) f.value = '';
      syncThemePicker();
    };
  }

  const slider = document.getElementById('boardAlphaSlider');
  if (slider) {
    const alphaSaved = localStorage.getItem(ALPHA_KEY);
    slider.value = alphaSaved !== null ? alphaSaved : 100;
    slider.oninput = () => applyBoardAlpha(parseInt(slider.value));
  }
}

/* ── settings panel (shared open/close controller) ──
   Every game's settings panel uses the same bottom-sheet chrome and the same
   #settingsBtn / #settingsBackdrop / #settingsPanel ids, so the open/close flow
   lives here and all games behave identically. A game may define a global
   syncSettingsUI() to mirror its own cfg into the panel's game-specific
   controls; it is invoked (if present) each time the panel opens, before the
   shared theme/background controls are refreshed via syncThemePicker(). */
function openSettings() {
  if (typeof syncSettingsUI === 'function') syncSettingsUI();
  syncThemePicker();
  document.getElementById('settingsBackdrop').classList.add('show');
  document.getElementById('settingsPanel').classList.add('show');
}

function closeSettings() {
  document.getElementById('settingsBackdrop').classList.remove('show');
  document.getElementById('settingsPanel').classList.remove('show');
}

function initSettingsPanel() {
  const btn = document.getElementById('settingsBtn');
  const backdrop = document.getElementById('settingsBackdrop');
  if (btn) btn.addEventListener('click', openSettings);
  if (backdrop) backdrop.addEventListener('click', closeSettings);
}

loadTheme();
loadBgImage();
loadBoardAlpha();
initSettingsPanel();
