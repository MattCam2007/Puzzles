/* Token editor rows: color swatches + hex inputs, radius sliders. */

import { TOKEN_SECTIONS, editor, isValidHex } from './store.js';
import { updatePreview } from './preview.js';

export function renderEditors() {
  const container = document.getElementById('tbEditors');
  container.innerHTML = '';

  TOKEN_SECTIONS.forEach((section) => {
    const sec = document.createElement('div');
    sec.className = 'tb-section';
    const lbl = document.createElement('div');
    lbl.className = 'tb-section-label';
    lbl.textContent = section.label;
    sec.appendChild(lbl);
    section.tokens.forEach((tok) => sec.appendChild(createColorRow(tok)));
    container.appendChild(sec);
  });

  // Shape section
  const shapeSec = document.createElement('div');
  shapeSec.className = 'tb-section';
  const shapeLbl = document.createElement('div');
  shapeLbl.className = 'tb-section-label';
  shapeLbl.textContent = 'Shape';
  shapeSec.appendChild(shapeLbl);

  shapeSec.appendChild(createRadiusRow({ key: '--radius', label: 'Card radius', min: 0, max: 32 }));
  shapeSec.appendChild(createRadiusSmRow());

  container.appendChild(shapeSec);
}

function createColorRow({ key, label }) {
  const val = editor.draft.tokens[key] || '#000000';
  const row = document.createElement('div');
  row.className = 'tb-token-row';

  const lbl = document.createElement('label');
  lbl.className = 'tb-token-label';
  lbl.textContent = label;

  const controls = document.createElement('div');
  controls.className = 'tb-token-controls';

  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.className = 'tb-color-swatch';
  colorInput.value = val;

  const hexInput = document.createElement('input');
  hexInput.type = 'text';
  hexInput.className = 'tb-hex-input';
  hexInput.value = val.toUpperCase();
  hexInput.maxLength = 7;
  hexInput.spellcheck = false;
  hexInput.autocomplete = 'off';

  colorInput.oninput = () => {
    hexInput.value = colorInput.value.toUpperCase();
    editor.draft.tokens[key] = colorInput.value;
    updatePreview();
  };

  hexInput.oninput = () => {
    const v = hexInput.value.trim();
    if (isValidHex(v)) {
      colorInput.value = v;
      editor.draft.tokens[key] = v;
      updatePreview();
    }
  };

  hexInput.onblur = () => {
    if (!isValidHex(hexInput.value)) {
      hexInput.value = (editor.draft.tokens[key] || '#000000').toUpperCase();
    } else {
      hexInput.value = hexInput.value.toUpperCase();
    }
  };

  controls.appendChild(colorInput);
  controls.appendChild(hexInput);
  row.appendChild(lbl);
  row.appendChild(controls);
  return row;
}

function createRadiusRow({ key, label, min, max }) {
  const rawVal = editor.draft.tokens[key] || '10px';
  const numVal = Math.min(max, Math.max(min, parseInt(rawVal) || 0));

  const row = document.createElement('div');
  row.className = 'tb-token-row';

  const lbl = document.createElement('label');
  lbl.className = 'tb-token-label';
  lbl.textContent = label;

  const controls = document.createElement('div');
  controls.className = 'tb-token-controls tb-shape-controls';

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.className = 'settings-slider';
  slider.min = min;
  slider.max = max;
  slider.value = numVal;

  const valLabel = document.createElement('span');
  valLabel.className = 'tb-shape-value';
  valLabel.textContent = `${numVal}px`;

  slider.oninput = () => {
    const v = parseInt(slider.value);
    valLabel.textContent = `${v}px`;
    editor.draft.tokens[key] = `${v}px`;
    updatePreview();
  };

  controls.appendChild(slider);
  controls.appendChild(valLabel);
  row.appendChild(lbl);
  row.appendChild(controls);
  return row;
}

function createRadiusSmRow() {
  const rawVal = editor.draft.tokens['--radius-sm'] || '6px';
  const isPill = parseInt(rawVal) >= 100;
  const numVal = isPill ? 6 : Math.min(32, Math.max(0, parseInt(rawVal) || 0));

  const row = document.createElement('div');
  row.className = 'tb-token-row';

  const lbl = document.createElement('label');
  lbl.className = 'tb-token-label';
  lbl.textContent = 'Button radius';

  const controls = document.createElement('div');
  controls.className = 'tb-token-controls tb-shape-controls';

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.className = 'settings-slider';
  slider.min = 0;
  slider.max = 32;
  slider.value = numVal;
  slider.disabled = isPill;

  const valLabel = document.createElement('span');
  valLabel.className = 'tb-shape-value';
  valLabel.textContent = isPill ? 'pill' : `${numVal}px`;

  const pillLabel = document.createElement('label');
  pillLabel.className = 'tb-pill-toggle';

  const pillCheck = document.createElement('input');
  pillCheck.type = 'checkbox';
  pillCheck.checked = isPill;
  pillLabel.appendChild(pillCheck);
  pillLabel.appendChild(document.createTextNode('Pill'));

  const apply = () => {
    if (pillCheck.checked) {
      editor.draft.tokens['--radius-sm'] = '999px';
      valLabel.textContent = 'pill';
      slider.disabled = true;
    } else {
      const v = parseInt(slider.value);
      editor.draft.tokens['--radius-sm'] = `${v}px`;
      valLabel.textContent = `${v}px`;
      slider.disabled = false;
    }
    updatePreview();
  };

  slider.oninput = () => {
    if (!pillCheck.checked) {
      const v = parseInt(slider.value);
      valLabel.textContent = `${v}px`;
      editor.draft.tokens['--radius-sm'] = `${v}px`;
      updatePreview();
    }
  };

  pillCheck.onchange = apply;

  controls.appendChild(slider);
  controls.appendChild(valLabel);
  controls.appendChild(pillLabel);
  row.appendChild(lbl);
  row.appendChild(controls);
  return row;
}
