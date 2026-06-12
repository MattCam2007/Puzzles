import { STORAGE_KEYS, loadJSON, saveJSON } from '../core/storage.js';

export function hexToRgb(hex) {
  if (!hex || hex.length < 7) return '0, 0, 0';
  return `${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)}`;
}

export function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function loadCustomThemes() {
  const themes = loadJSON(STORAGE_KEYS.customThemes, []);
  return Array.isArray(themes) ? themes : [];
}

export function saveCustomThemesToStorage(themes) {
  saveJSON(STORAGE_KEYS.customThemes, themes);
}

/** Injects (or removes, when theme is null) the <style> block for a custom theme. */
export function injectCustomTheme(theme) {
  let el = document.getElementById('custom-theme-style');
  if (!theme) {
    if (el) el.remove();
    return;
  }
  if (!el) {
    el = document.createElement('style');
    el.id = 'custom-theme-style';
    document.head.appendChild(el);
  }
  const t = theme.tokens;
  const ar = hexToRgb(t['--accent'] || '#000000');
  const a2r = hexToRgb(t['--accent2'] || '#000000');
  const lines = Object.entries(t)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n');
  el.textContent = `html[data-theme="${theme.id}"] {\n${lines}\n  --accent-rgb: ${ar};\n  --accent2-rgb: ${a2r};\n  --accent-dim: rgba(${ar}, 0.18);\n  --accent-dim2: rgba(${a2r}, 0.12);\n}`;
}
