/* Saved custom themes list: apply / edit / delete. */

import { STORAGE_KEYS } from '../core/storage.js';
import { applyTheme } from '../theme/theme.js';
import { loadCustomThemes, saveCustomThemesToStorage, escapeHtml } from '../theme/custom-themes.js';
import { editor, setDraft, newDraft } from './store.js';

/** Wired by main.js so deleting/editing can refresh the editor UI. */
let onDraftReplaced = () => {};
export function setOnDraftReplaced(fn) {
  onDraftReplaced = fn;
}

export function renderSavedThemes() {
  const list = document.getElementById('tbSavedList');
  if (!list) return;

  const customs = loadCustomThemes();
  if (customs.length === 0) {
    list.innerHTML = '<div class="tb-empty-state">No custom themes saved yet.</div>';
    return;
  }

  list.innerHTML = customs
    .map((t) => {
      const bg = escapeHtml(t.tokens['--bg'] || '#000');
      const ac = escapeHtml(t.tokens['--accent'] || '#888');
      const ac2 = escapeHtml(t.tokens['--accent2'] || '#aaa');
      return (
        `<div class="tb-saved-item">` +
        `<span class="tb-saved-icon">${escapeHtml(t.icon || '🎨')}</span>` +
        `<span class="tb-saved-name">${escapeHtml(t.label)}</span>` +
        `<span class="tb-saved-swatches">` +
        `<span class="tb-swatch-dot" style="background:${bg}"></span>` +
        `<span class="tb-swatch-dot" style="background:${ac}"></span>` +
        `<span class="tb-swatch-dot" style="background:${ac2}"></span>` +
        `</span>` +
        `<span class="tb-saved-btns">` +
        `<button class="tb-chip tb-chip-apply" data-sa="apply" data-id="${t.id}">Apply</button>` +
        `<button class="tb-chip" data-sa="edit"  data-id="${t.id}">Edit</button>` +
        `<button class="tb-chip tb-chip-del" data-sa="del"  data-id="${t.id}">✕</button>` +
        `</span>` +
        `</div>`
      );
    })
    .join('');

  list.querySelectorAll('[data-sa]').forEach((btn) => {
    btn.onclick = () => {
      const { sa, id } = btn.dataset;
      if (sa === 'apply') doApply(id, btn);
      else if (sa === 'edit') doEdit(id);
      else if (sa === 'del') doDelete(id);
    };
  });
}

export function doApply(id, btn) {
  applyTheme(id);
  if (btn) {
    const orig = btn.textContent;
    btn.textContent = 'Applied!';
    setTimeout(() => (btn.textContent = orig), 1500);
  }
}

export function doEdit(id) {
  const found = loadCustomThemes().find((t) => t.id === id);
  if (!found) return;
  setDraft({ ...found, tokens: { ...found.tokens } });
  onDraftReplaced();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

export function doDelete(id) {
  if (!confirm('Delete this theme?')) return;
  const themes = loadCustomThemes().filter((t) => t.id !== id);
  saveCustomThemesToStorage(themes);
  let theme = null;
  try {
    theme = localStorage.getItem(STORAGE_KEYS.theme);
  } catch {
    /* default below */
  }
  if (theme === id) applyTheme('galaxy');
  // an in-progress edit of the deleted theme must not resurrect it on save
  if (editor.draft.id === id) {
    setDraft(newDraft());
    onDraftReplaced();
  }
  renderSavedThemes();
}
