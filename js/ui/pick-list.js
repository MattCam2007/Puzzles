import { escapeHtml } from '../theme/custom-themes.js';

/**
 * Renders a `.pick-row` option list (animation styles, tile modes, …).
 * @param {Element} container
 * @param {{id: string, icon: string, label: string}[]} items
 * @param {string} selectedId
 * @param {(id: string) => void} onPick
 */
export function renderPickList(container, items, selectedId, onPick) {
  container.innerHTML = '';
  for (const item of items) {
    const row = document.createElement('div');
    row.className = 'pick-row' + (item.id === selectedId ? ' selected' : '');
    row.innerHTML = `<span class="pick-icon">${escapeHtml(item.icon)}</span>${escapeHtml(item.label)}<span class="pick-check">✓</span>`;
    row.onclick = () => onPick(item.id);
    container.appendChild(row);
  }
}
