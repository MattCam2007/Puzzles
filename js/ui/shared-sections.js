/* The Appearance and Background Image settings sections, injected at boot
   into the `<div data-shared-settings></div>` placeholder of each game's
   settings panel. One source of truth: theme rows are generated from
   THEMES, so adding a theme updates every page at once. */

import { THEMES } from '../theme/theme.js';
import { escapeHtml } from '../theme/custom-themes.js';

function appearanceSectionHtml(themes) {
  const rows = themes
    .map(
      (t) =>
        `    <div class="pick-row" data-theme-pick="${t.id}">
      <span class="pick-icon">${escapeHtml(t.icon)}</span>${escapeHtml(t.label)}<span class="pick-check">✓</span>
    </div>`,
    )
    .join('\n');
  return `<div class="settings-section">
    <div class="settings-section-label">Appearance</div>
${rows}
    <div id="customThemesList"></div>
    <a href="theme-builder.html" class="pick-row-link">
      <span class="pick-icon">🎨</span>Build a theme<span class="pick-arrow">›</span>
    </a>
    <div class="setting-row">
      <div class="setting-info">
        <div class="setting-name">Board opacity</div>
      </div>
      <input type="range" id="boardAlphaSlider" min="0" max="100" value="100" class="settings-slider">
    </div>
  </div>`;
}

function backgroundSectionHtml() {
  return `<div class="settings-section">
    <div class="settings-section-label">Background Image</div>
    <div class="pick-row" id="bgUploadRow">
      <span class="pick-icon">📁</span>Upload from device<span class="pick-check">✓</span>
      <input type="file" accept="image/*" id="bgImageFile" style="display:none">
    </div>
    <div class="bg-url-row">
      <input type="text" id="bgImageUrl" class="settings-text-input" placeholder="Paste image URL…">
    </div>
    <div class="pick-row" id="clearBgBtn">
      <span class="pick-icon">✕</span>No background<span class="pick-check">✓</span>
    </div>
  </div>`;
}

export function injectSharedSections() {
  const slot = document.querySelector('[data-shared-settings]');
  if (!slot) return;
  slot.outerHTML = appearanceSectionHtml(THEMES) + backgroundSectionHtml();
}
