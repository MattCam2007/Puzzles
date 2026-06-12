/* Theme JSON export / import. */

import { GALAXY_DEFAULTS, editor, setDraft } from './store.js';

export function exportTheme() {
  const label = (document.getElementById('tbThemeName').value || 'My Theme').trim();
  const obj = { label, icon: editor.draft.icon, tokens: { ...editor.draft.tokens } };
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${label.toLowerCase().replace(/\s+/g, '-')}-theme.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importTheme(file, onImported) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const obj = JSON.parse(e.target.result);
      if (!obj || typeof obj.tokens !== 'object') throw new Error();

      setDraft({
        id: obj.id && String(obj.id).startsWith('custom-') ? obj.id : null,
        label: (obj.label || 'Imported Theme').trim(),
        icon: obj.icon || '🎨',
        tokens: { ...GALAXY_DEFAULTS, ...obj.tokens },
      });
      onImported();
    } catch {
      alert('Could not import — not a valid theme file.');
    }
  };
  reader.readAsText(file);
}
