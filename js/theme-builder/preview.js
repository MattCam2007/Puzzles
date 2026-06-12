/* Live preview — applies the draft's tokens as inline vars on the preview card. */

import { hexToRgb } from '../theme/custom-themes.js';
import { editor } from './store.js';

export function updatePreview() {
  const preview = document.getElementById('tbPreview');
  if (!preview) return;
  const t = editor.draft.tokens;
  const ar = hexToRgb(t['--accent'] || '#000000');
  const a2r = hexToRgb(t['--accent2'] || '#000000');

  // Apply all token vars as inline style on preview container so children inherit them
  const props = Object.entries(t).map(([k, v]) => `${k}:${v}`);
  props.push(`--accent-rgb:${ar}`);
  props.push(`--accent2-rgb:${a2r}`);
  props.push(`--accent-dim:rgba(${ar},0.18)`);
  props.push(`--accent-dim2:rgba(${a2r},0.12)`);
  props.push('--board-alpha:100%');
  preview.style.cssText = props.join(';');
}
