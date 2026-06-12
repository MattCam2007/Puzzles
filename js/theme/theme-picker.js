/* Settings-panel wiring for theme, background image and board opacity.
   Every section is optional — pages without the corresponding elements
   (e.g. the theme builder) simply skip them. */

import { applyTheme } from './theme.js';
import { loadCustomThemes, escapeHtml } from './custom-themes.js';
import {
  applyBgImage,
  applyBoardAlpha,
  getSavedBgImage,
  getSavedBoardAlpha,
} from './background.js';

function syncBuiltinRows(current) {
  document.querySelectorAll('[data-theme-pick]').forEach((row) => {
    row.classList.toggle('selected', row.dataset.themePick === current);
    row.onclick = () => applyTheme(row.dataset.themePick);
  });
}

function syncCustomRows(current) {
  const customList = document.getElementById('customThemesList');
  if (!customList) return;
  const customs = loadCustomThemes();
  customList.innerHTML = customs
    .map(
      (t) =>
        `<div class="pick-row${t.id === current ? ' selected' : ''}" data-custom-pick="${t.id}">` +
        `<span class="pick-icon">${escapeHtml(t.icon || '🎨')}</span>${escapeHtml(t.label)}<span class="pick-check">✓</span></div>`,
    )
    .join('');
  customList.querySelectorAll('[data-custom-pick]').forEach((row) => {
    row.onclick = () => applyTheme(row.dataset.customPick);
  });
}

function resetUrlInput() {
  const u = document.getElementById('bgImageUrl');
  if (u) {
    u.value = '';
    u.placeholder = 'Paste image URL…';
  }
}

function readAndApply(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    applyBgImage(e.target.result);
    resetUrlInput();
    syncThemePicker();
  };
  reader.readAsDataURL(file);
}

async function pickImageFile() {
  if (window.showOpenFilePicker) {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [
          {
            description: 'Images',
            accept: {
              'image/*': ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.avif', '.svg'],
            },
          },
        ],
        multiple: false,
      });
      readAndApply(await handle.getFile());
    } catch {
      /* user cancelled the picker */
    }
  } else {
    const f = document.getElementById('bgImageFile');
    if (f) f.click();
  }
}

function syncBgControls() {
  const saved = getSavedBgImage();
  const hasBg = !!saved;
  const isUpload = hasBg && saved.startsWith('data:');

  const uploadRow = document.getElementById('bgUploadRow');
  if (uploadRow) {
    uploadRow.classList.toggle('selected', isUpload);
    uploadRow.onclick = () => pickImageFile();
  }

  const clearBtn = document.getElementById('clearBgBtn');
  if (clearBtn) {
    clearBtn.classList.toggle('selected', !hasBg);
    clearBtn.onclick = () => {
      applyBgImage(null);
      resetUrlInput();
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
      readAndApply(file);
      fileInput.value = '';
    };
  }

  const urlInput = document.getElementById('bgImageUrl');
  if (urlInput) {
    urlInput.value = saved && !isUpload ? saved : '';
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

function syncAlphaSlider() {
  const slider = document.getElementById('boardAlphaSlider');
  if (!slider) return;
  slider.value = getSavedBoardAlpha();
  slider.oninput = () => applyBoardAlpha(parseInt(slider.value));
}

export function syncThemePicker() {
  const current = document.documentElement.getAttribute('data-theme') || 'galaxy';
  syncBuiltinRows(current);
  syncCustomRows(current);
  syncBgControls();
  syncAlphaSlider();
}
