/* Theme-builder composition root. */

import { applyTheme } from '../theme/theme.js';
import { loadCustomThemes, saveCustomThemesToStorage } from '../theme/custom-themes.js';
import { ICONS, editor, setDraft, newDraft } from './store.js';
import { renderEditors } from './token-editors.js';
import { updatePreview } from './preview.js';
import { renderSavedThemes, setOnDraftReplaced } from './saved-themes.js';
import { exportTheme, importTheme } from './import-export.js';
import { initPreviewCarousel } from './carousel.js';

function updateEditingBadge() {
  const badge = document.getElementById('tbEditingBadge');
  if (!badge) return;
  if (editor.draft.id) {
    badge.textContent = `Editing: ${editor.draft.label}`;
    badge.style.display = '';
  } else {
    badge.style.display = 'none';
  }
}

/** Re-sync the whole editor UI from the current draft. */
function syncEditorUI() {
  document.getElementById('tbThemeName').value = editor.draft.label;
  document.getElementById('tbIconBtn').textContent = editor.draft.icon;
  updateEditingBadge();
  renderEditors();
  updatePreview();
}

function saveTheme() {
  const label = (document.getElementById('tbThemeName').value || 'My Theme').trim();
  editor.draft.label = label;

  const customs = loadCustomThemes();

  if (editor.draft.id) {
    const idx = customs.findIndex((t) => t.id === editor.draft.id);
    const entry = {
      id: editor.draft.id,
      label,
      icon: editor.draft.icon,
      tokens: { ...editor.draft.tokens },
    };
    if (idx >= 0) customs[idx] = entry;
    else customs.push(entry);
  } else {
    editor.draft.id = `custom-${Date.now()}`;
    customs.push({
      id: editor.draft.id,
      label,
      icon: editor.draft.icon,
      tokens: { ...editor.draft.tokens },
    });
  }

  saveCustomThemesToStorage(customs);
  applyTheme(editor.draft.id);
  updateEditingBadge();
  renderSavedThemes();

  const btn = document.getElementById('tbSaveBtn');
  btn.textContent = 'Saved!';
  setTimeout(() => (btn.textContent = 'Save Theme'), 1600);
}

function renderIconPicker() {
  const popup = document.getElementById('tbIconPopup');
  if (!popup) return;
  popup.innerHTML = ICONS.map(
    (ic) => `<button class="tb-icon-opt" type="button">${ic}</button>`,
  ).join('');
  popup.querySelectorAll('.tb-icon-opt').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      editor.draft.icon = btn.textContent.trim();
      document.getElementById('tbIconBtn').textContent = editor.draft.icon;
      popup.style.display = 'none';
      updatePreview();
    };
  });
}

function toggleIconPicker(e) {
  e.stopPropagation();
  const popup = document.getElementById('tbIconPopup');
  if (!popup) return;
  popup.style.display = popup.style.display === 'grid' ? 'none' : 'grid';
}

function resetToNew() {
  setDraft(newDraft());
  syncEditorUI();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

export function boot() {
  // Check URL params for ?edit=custom-xxx
  const params = new URLSearchParams(location.search);
  const editId = params.get('edit');
  if (editId) {
    const found = loadCustomThemes().find((t) => t.id === editId);
    if (found) setDraft({ ...found, tokens: { ...found.tokens } });
  }

  setOnDraftReplaced(syncEditorUI);

  // Render dynamic sections
  renderIconPicker();
  renderSavedThemes();
  initPreviewCarousel(); // build slides + wire swipe
  syncEditorUI();

  // Icon button
  document.getElementById('tbIconBtn').addEventListener('click', toggleIconPicker);

  // Close icon popup on outside click
  document.addEventListener('click', () => {
    const popup = document.getElementById('tbIconPopup');
    if (popup) popup.style.display = 'none';
  });

  // Name input
  document.getElementById('tbThemeName').addEventListener('input', (e) => {
    editor.draft.label = e.target.value || 'My Theme';
  });

  // Action buttons
  document.getElementById('tbSaveBtn').addEventListener('click', saveTheme);
  document.getElementById('tbExportBtn').addEventListener('click', exportTheme);
  document.getElementById('tbNewBtn').addEventListener('click', resetToNew);

  // Import file input
  document.getElementById('tbImportFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) importTheme(file, syncEditorUI);
    e.target.value = '';
  });
}
