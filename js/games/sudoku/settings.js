/* Sudoku settings-panel bindings — toggles declared as data. */

import { $, $$ } from '../../core/dom.js';
import { bindToggle } from '../../ui/settings-panel.js';
import { saveCfg } from './state.js';

const TOGGLES = [
  ['togHighlight', 'highlight'],
  ['togSameNum', 'sameNum'],
  ['togHighlightPencil', 'highlightPencil'],
  ['togErasePencilMarks', 'erasePencilMarks'],
  ['togHints', 'showHints'],
  ['togCandidates', 'showCandidates'],
  ['togExcluded', 'showExcluded'],
  ['togCheckMistakes', 'checkMistakes'],
  ['togMistakeDots', 'showMistakeDots'],
  ['togKeyboard', 'useKeyboard'],
  ['togNumpad', 'showNumpad'],
];

export function syncSettingsUI(cfg) {
  for (const [id, key] of TOGGLES) $('#' + id).checked = cfg[key];
  $('#segCell').classList.toggle('active', cfg.inputMode === 'cell');
  $('#segNumber').classList.toggle('active', cfg.inputMode === 'number');
  $$('.strike-opt').forEach((opt) => {
    opt.classList.toggle('active', +opt.dataset.val === cfg.strikeLimit);
  });
}

/**
 * @param {object} cfg live config object
 * @param {() => void} refreshAll re-render board/numpad/dots + button states
 * @param {(mode: string) => void} setInputMode mode switch (clears selection)
 */
export function initSettings(cfg, refreshAll, setInputMode) {
  for (const [id, key] of TOGGLES) {
    bindToggle(
      id,
      () => cfg[key],
      (v) => {
        cfg[key] = v;
        saveCfg(cfg);
      },
      refreshAll,
    );
  }

  $('#segCell').addEventListener('click', () => setInputMode('cell'));
  $('#segNumber').addEventListener('click', () => setInputMode('number'));

  $$('.strike-opt').forEach((opt) => {
    opt.addEventListener('click', () => {
      cfg.strikeLimit = +opt.dataset.val;
      saveCfg(cfg);
      syncSettingsUI(cfg);
      refreshAll();
    });
  });
}
