import { STORAGE_KEYS } from '../core/storage.js';
import { loadCustomThemes, injectCustomTheme } from './custom-themes.js';
import { syncThemePicker } from './theme-picker.js';

export const THEMES = [
  { id: 'galaxy', icon: '🌌', label: 'Galaxy' },
  { id: 'midnight', icon: '🌊', label: 'Midnight' },
  { id: 'sakura', icon: '🌸', label: 'Sakura' },
  { id: 'terminal', icon: '💻', label: 'Terminal' },
];

export function applyTheme(id) {
  if (id && id.startsWith('custom-')) {
    injectCustomTheme(loadCustomThemes().find((t) => t.id === id) || null);
  } else {
    injectCustomTheme(null);
  }
  document.documentElement.setAttribute('data-theme', id || 'galaxy');
  try {
    localStorage.setItem(STORAGE_KEYS.theme, id || 'galaxy');
  } catch {
    /* best-effort */
  }
  syncThemePicker();
}

export function loadTheme() {
  let saved = 'galaxy';
  try {
    saved = localStorage.getItem(STORAGE_KEYS.theme) || 'galaxy';
  } catch {
    /* default */
  }
  if (saved.startsWith('custom-')) {
    injectCustomTheme(loadCustomThemes().find((t) => t.id === saved) || null);
  }
  document.documentElement.setAttribute('data-theme', saved);
}
