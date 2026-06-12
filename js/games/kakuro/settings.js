/* Kakuro settings-panel bindings. */

import { $ } from '../../core/dom.js';
import { bindToggle } from '../../ui/settings-panel.js';
import { saveSettings } from './state.js';

const TOGGLES = [
  ['togAutocheck', 'autocheck'],
  ['togRuns', 'runs'],
  ['togDimpad', 'dimpad'],
  ['togTimer', 'timer'],
  ['togHighlightPencil', 'highlightPencil'],
  ['togErasePencilMarks', 'erasePencilMarks'],
];

export function syncSettingsUI(settings) {
  for (const [id, key] of TOGGLES) $('#' + id).checked = settings[key];
}

/**
 * @param {object} settings live settings object
 * @param {Record<string, () => void>} after per-key callbacks (re-render etc.)
 */
export function initSettings(settings, after = {}) {
  for (const [id, key] of TOGGLES) {
    bindToggle(
      id,
      () => settings[key],
      (v) => {
        settings[key] = v;
        saveSettings(settings);
      },
      after[key],
    );
  }
}
