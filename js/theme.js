const THEMES = [
  { id: 'galaxy',   icon: '🌌', label: 'Galaxy'   },
  { id: 'midnight', icon: '🌊', label: 'Midnight' },
  { id: 'sakura',   icon: '🌸', label: 'Sakura'   },
  { id: 'terminal', icon: '💻', label: 'Terminal' },
];

const BG_KEY = 'puzzle-bg-image';

function applyTheme(id) {
  document.documentElement.setAttribute('data-theme', id);
  localStorage.setItem('puzzle-theme', id);
  syncThemePicker();
}

function loadTheme() {
  const saved = localStorage.getItem('puzzle-theme') || 'galaxy';
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

function syncThemePicker() {
  const current = document.documentElement.getAttribute('data-theme') || 'galaxy';
  document.querySelectorAll('[data-theme-pick]').forEach(row => {
    const active = row.dataset.themePick === current;
    row.classList.toggle('selected', active);
    row.onclick = () => applyTheme(row.dataset.themePick);
  });

  const saved = localStorage.getItem(BG_KEY);
  const hasBg = !!saved;
  const isUpload = hasBg && saved.startsWith('data:');

  const uploadRow = document.getElementById('bgUploadRow');
  if (uploadRow) uploadRow.classList.toggle('selected', isUpload);

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
      const reader = new FileReader();
      reader.onload = e => {
        applyBgImage(e.target.result);
        const u = document.getElementById('bgImageUrl');
        if (u) { u.value = ''; u.placeholder = 'Paste image URL…'; }
        syncThemePicker();
      };
      reader.readAsDataURL(file);
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
}

loadTheme();
loadBgImage();
