/* Theme Builder — editor logic */

const TOKEN_SECTIONS = [
  { label: 'Surfaces', tokens: [
    { key: '--bg',         label: 'Background'       },
    { key: '--surface',    label: 'Surface'           },
    { key: '--surface2',   label: 'Surface 2'         },
    { key: '--surface3',   label: 'Border / Divider'  },
    { key: '--cell-empty', label: 'Empty Cell'        },
  ]},
  { label: 'Accents', tokens: [
    { key: '--accent',  label: 'Accent (primary)'   },
    { key: '--accent2', label: 'Accent 2 (secondary)' },
  ]},
  { label: 'Text', tokens: [
    { key: '--text',       label: 'Primary text' },
    { key: '--text-muted', label: 'Muted text'   },
    { key: '--text-dim',   label: 'Dim text'     },
  ]},
];

const GALAXY_DEFAULTS = {
  '--bg':         '#0f0f13',
  '--surface':    '#1a1a24',
  '--surface2':   '#22222f',
  '--surface3':   '#2a2a3a',
  '--cell-empty': '#1e1e2a',
  '--accent':     '#7c6af7',
  '--accent2':    '#c084fc',
  '--text':       '#e8e6f0',
  '--text-muted': '#6b6880',
  '--text-dim':   '#9b97b8',
  '--radius':     '10px',
  '--radius-sm':  '6px',
};

const ICONS = ['🎨','🌈','⭐','🔥','🌙','☀️','🌊','🌿','🍇','🦋','🎭','🎪','💎','🏔️','🌺','🎸','🚀','🌵','🦄','🎯'];

let draft = {
  id: null,
  label: 'My Theme',
  icon: '🎨',
  tokens: { ...GALAXY_DEFAULTS },
};

/* ── helpers ── */

function tbHexToRgb(hex) {
  if (!hex || hex.length < 7) return '0, 0, 0';
  return `${parseInt(hex.slice(1,3),16)}, ${parseInt(hex.slice(3,5),16)}, ${parseInt(hex.slice(5,7),16)}`;
}

function tbEsc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function isValidHex(v) {
  return /^#[0-9a-fA-F]{6}$/.test(v);
}

/* ── preview ── */

function updatePreview() {
  const preview = document.getElementById('tbPreview');
  if (!preview) return;
  const t = draft.tokens;
  const ar  = tbHexToRgb(t['--accent']  || '#000000');
  const a2r = tbHexToRgb(t['--accent2'] || '#000000');

  // Apply all token vars as inline style on preview container so children inherit them
  const props = Object.entries(t).map(([k,v]) => `${k}:${v}`);
  props.push(`--accent-rgb:${ar}`);
  props.push(`--accent2-rgb:${a2r}`);
  props.push(`--accent-dim:rgba(${ar},0.18)`);
  props.push(`--accent-dim2:rgba(${a2r},0.12)`);
  props.push('--board-alpha:100%');
  preview.style.cssText = props.join(';');
}

/* ── editors ── */

function renderEditors() {
  const container = document.getElementById('tbEditors');
  container.innerHTML = '';

  TOKEN_SECTIONS.forEach(section => {
    const sec = document.createElement('div');
    sec.className = 'tb-section';
    const lbl = document.createElement('div');
    lbl.className = 'tb-section-label';
    lbl.textContent = section.label;
    sec.appendChild(lbl);
    section.tokens.forEach(tok => sec.appendChild(createColorRow(tok)));
    container.appendChild(sec);
  });

  // Shape section
  const shapeSec = document.createElement('div');
  shapeSec.className = 'tb-section';
  const shapeLbl = document.createElement('div');
  shapeLbl.className = 'tb-section-label';
  shapeLbl.textContent = 'Shape';
  shapeSec.appendChild(shapeLbl);

  shapeSec.appendChild(createRadiusRow({
    key: '--radius', label: 'Card radius', min: 0, max: 32,
  }));
  shapeSec.appendChild(createRadiusSmRow());

  container.appendChild(shapeSec);
}

function createColorRow({ key, label }) {
  const val = draft.tokens[key] || '#000000';
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
    draft.tokens[key] = colorInput.value;
    updatePreview();
  };

  hexInput.oninput = () => {
    const v = hexInput.value.trim();
    if (isValidHex(v)) {
      colorInput.value = v;
      draft.tokens[key] = v;
      updatePreview();
    }
  };

  hexInput.onblur = () => {
    if (!isValidHex(hexInput.value)) {
      hexInput.value = (draft.tokens[key] || '#000000').toUpperCase();
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
  const rawVal = draft.tokens[key] || '10px';
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
    draft.tokens[key] = `${v}px`;
    updatePreview();
  };

  controls.appendChild(slider);
  controls.appendChild(valLabel);
  row.appendChild(lbl);
  row.appendChild(controls);
  return row;
}

function createRadiusSmRow() {
  const rawVal = draft.tokens['--radius-sm'] || '6px';
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
      draft.tokens['--radius-sm'] = '999px';
      valLabel.textContent = 'pill';
      slider.disabled = true;
    } else {
      const v = parseInt(slider.value);
      draft.tokens['--radius-sm'] = `${v}px`;
      valLabel.textContent = `${v}px`;
      slider.disabled = false;
    }
    updatePreview();
  };

  slider.oninput = () => {
    if (!pillCheck.checked) {
      const v = parseInt(slider.value);
      valLabel.textContent = `${v}px`;
      draft.tokens['--radius-sm'] = `${v}px`;
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

/* ── saved themes list ── */

function renderSavedThemes() {
  const list = document.getElementById('tbSavedList');
  if (!list) return;

  const customs = loadCustomThemes();
  if (customs.length === 0) {
    list.innerHTML = '<div class="tb-empty-state">No custom themes saved yet.</div>';
    return;
  }

  list.innerHTML = customs.map(t => {
    const bg  = tbEsc(t.tokens['--bg']      || '#000');
    const ac  = tbEsc(t.tokens['--accent']  || '#888');
    const ac2 = tbEsc(t.tokens['--accent2'] || '#aaa');
    return (
      `<div class="tb-saved-item">` +
      `<span class="tb-saved-icon">${tbEsc(t.icon || '🎨')}</span>` +
      `<span class="tb-saved-name">${tbEsc(t.label)}</span>` +
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
  }).join('');

  list.querySelectorAll('[data-sa]').forEach(btn => {
    btn.onclick = () => {
      const { sa, id } = btn.dataset;
      if      (sa === 'apply') doApply(id, btn);
      else if (sa === 'edit')  doEdit(id);
      else if (sa === 'del')   doDelete(id);
    };
  });
}

function doApply(id, btn) {
  applyTheme(id);
  if (btn) { const orig = btn.textContent; btn.textContent = 'Applied!'; setTimeout(() => btn.textContent = orig, 1500); }
}

function doEdit(id) {
  const found = loadCustomThemes().find(t => t.id === id);
  if (!found) return;
  draft = { ...found, tokens: { ...found.tokens } };
  document.getElementById('tbThemeName').value = draft.label;
  document.getElementById('tbIconBtn').textContent = draft.icon;
  updateEditingBadge();
  renderEditors();
  updatePreview();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function doDelete(id) {
  if (!confirm('Delete this theme?')) return;
  const themes = loadCustomThemes().filter(t => t.id !== id);
  saveCustomThemesToStorage(themes);
  if (localStorage.getItem('puzzle-theme') === id) applyTheme('galaxy');
  renderSavedThemes();
}

/* ── save / export / import ── */

function saveTheme() {
  const label = (document.getElementById('tbThemeName').value || 'My Theme').trim();
  draft.label = label;

  const customs = loadCustomThemes();

  if (draft.id) {
    const idx = customs.findIndex(t => t.id === draft.id);
    const entry = { id: draft.id, label, icon: draft.icon, tokens: { ...draft.tokens } };
    if (idx >= 0) customs[idx] = entry; else customs.push(entry);
  } else {
    draft.id = `custom-${Date.now()}`;
    customs.push({ id: draft.id, label, icon: draft.icon, tokens: { ...draft.tokens } });
  }

  saveCustomThemesToStorage(customs);
  applyTheme(draft.id);
  updateEditingBadge();
  renderSavedThemes();

  const btn = document.getElementById('tbSaveBtn');
  btn.textContent = 'Saved!';
  setTimeout(() => btn.textContent = 'Save Theme', 1600);
}

function exportTheme() {
  const label = (document.getElementById('tbThemeName').value || 'My Theme').trim();
  const obj = { label, icon: draft.icon, tokens: { ...draft.tokens } };
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${label.toLowerCase().replace(/\s+/g,'-')}-theme.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importTheme(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const obj = JSON.parse(e.target.result);
      if (!obj || typeof obj.tokens !== 'object') throw new Error();

      draft = {
        id:     obj.id && String(obj.id).startsWith('custom-') ? obj.id : null,
        label:  (obj.label || 'Imported Theme').trim(),
        icon:   obj.icon  || '🎨',
        tokens: { ...GALAXY_DEFAULTS, ...obj.tokens },
      };

      document.getElementById('tbThemeName').value = draft.label;
      document.getElementById('tbIconBtn').textContent = draft.icon;
      updateEditingBadge();
      renderEditors();
      updatePreview();
    } catch {
      alert('Could not import — not a valid theme file.');
    }
  };
  reader.readAsText(file);
}

/* ── icon picker ── */

function renderIconPicker() {
  const popup = document.getElementById('tbIconPopup');
  if (!popup) return;
  popup.innerHTML = ICONS.map(ic =>
    `<button class="tb-icon-opt" type="button">${ic}</button>`
  ).join('');
  popup.querySelectorAll('.tb-icon-opt').forEach(btn => {
    btn.onclick = e => {
      e.stopPropagation();
      draft.icon = btn.textContent.trim();
      document.getElementById('tbIconBtn').textContent = draft.icon;
      popup.style.display = 'none';
      updatePreview();
    };
  });
}

function toggleIconPicker(e) {
  e.stopPropagation();
  const popup = document.getElementById('tbIconPopup');
  if (!popup) return;
  popup.style.display = popup.style.display === 'grid' ? 'none' : 'grid';
}

/* ── new theme / reset ── */

function resetToNew() {
  draft = { id: null, label: 'My Theme', icon: '🎨', tokens: { ...GALAXY_DEFAULTS } };
  document.getElementById('tbThemeName').value = draft.label;
  document.getElementById('tbIconBtn').textContent = draft.icon;
  updateEditingBadge();
  renderEditors();
  updatePreview();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ── editing badge ── */

function updateEditingBadge() {
  const badge = document.getElementById('tbEditingBadge');
  if (!badge) return;
  if (draft.id) {
    badge.textContent = `Editing: ${draft.label}`;
    badge.style.display = '';
  } else {
    badge.style.display = 'none';
  }
}

/* ── init ── */

/* ── Preview carousel ── */

function initPreviewCarousel() {
  const slidesEl = document.getElementById('tpSlides');
  const dotsEl   = document.getElementById('tpDots');
  if (!slidesEl || !dotsEl) return;

  // Inject Sudoku and Kakuro slides
  slidesEl.appendChild(createSudokuSlide());
  slidesEl.appendChild(createKakuroSlide());

  const dots = [...dotsEl.querySelectorAll('.tp-dot')];
  let current = 0;
  const total  = 3;
  let startX = 0, dragDelta = 0, dragging = false;

  function goTo(idx) {
    current = Math.max(0, Math.min(total - 1, idx));
    slidesEl.style.transition = 'transform 0.32s cubic-bezier(0.4,0,0.2,1)';
    slidesEl.style.transform  = `translateX(${-current * 100}%)`;
    dots.forEach((d, i) => d.classList.toggle('active', i === current));
  }

  function dragStart(x) { startX = x; dragDelta = 0; dragging = true; }

  function dragMove(x) {
    if (!dragging) return;
    dragDelta = x - startX;
    slidesEl.style.transition = 'none';
    slidesEl.style.transform  = `translateX(calc(${-current * 100}% + ${dragDelta}px))`;
  }

  function dragEnd() {
    if (!dragging) return;
    dragging = false;
    if      (dragDelta < -40) goTo(current + 1);
    else if (dragDelta >  40) goTo(current - 1);
    else                      goTo(current);
    dragDelta = 0;
  }

  // Touch events
  slidesEl.addEventListener('touchstart', e => dragStart(e.touches[0].clientX), { passive: true });
  slidesEl.addEventListener('touchmove',  e => { e.preventDefault(); dragMove(e.touches[0].clientX); }, { passive: false });
  slidesEl.addEventListener('touchend',   dragEnd, { passive: true });

  // Mouse events (drag on desktop)
  slidesEl.addEventListener('mousedown',  e => { e.preventDefault(); dragStart(e.clientX); });
  window.addEventListener  ('mousemove',  e => dragMove(e.clientX));
  window.addEventListener  ('mouseup',    dragEnd);

  // Dot clicks
  dots.forEach((dot, i) => dot.addEventListener('click', () => goTo(i)));
}

function createSudokuSlide() {
  // Classic "given" digits — empties are 0
  const PUZZLE = [
    [5,3,0, 0,7,0, 0,0,0],
    [6,0,0, 1,9,5, 0,0,0],
    [0,9,8, 0,0,0, 0,6,0],
    [8,0,0, 0,6,0, 0,0,3],
    [4,0,0, 8,0,3, 0,0,1],
    [7,0,0, 0,2,0, 0,0,6],
    [0,6,0, 0,0,0, 2,8,0],
    [0,0,0, 4,1,9, 0,0,5],
    [0,0,0, 0,8,0, 0,7,9],
  ];
  const SEL_R = 4, SEL_C = 4; // highlighted cell

  const slide = document.createElement('div');
  slide.className = 'tp-slide tp-wrap';
  slide.innerHTML = `
    <div class="tp-header">
      <div class="tp-title">Sudoku</div>
      <div class="tp-scores">
        <div class="tp-score"><div class="tp-score-lbl">TIME</div><div class="tp-score-val">3:45</div></div>
      </div>
    </div>`;

  const grid = document.createElement('div');
  grid.className = 'tp-sudoku-grid';

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const cell = document.createElement('div');
      cell.className = 'tp-sudoku-cell';
      if (c % 3 === 0 && c > 0) cell.classList.add('tp-box-left');
      if (r % 3 === 0 && r > 0) cell.classList.add('tp-box-top');
      if (PUZZLE[r][c])        { cell.textContent = PUZZLE[r][c]; cell.classList.add('tp-given'); }
      if (r === SEL_R && c === SEL_C) cell.classList.add('tp-selected');
      grid.appendChild(cell);
    }
  }
  slide.appendChild(grid);

  const numpad = document.createElement('div');
  numpad.className = 'tp-numpad';
  for (let n = 1; n <= 9; n++) {
    const btn = document.createElement('div');
    btn.className = 'tp-numpad-btn';
    btn.textContent = n;
    numpad.appendChild(btn);
  }
  slide.appendChild(numpad);

  const texts = document.createElement('div');
  texts.className = 'tp-texts';
  texts.innerHTML = `
    <span class="tp-text-primary">Primary</span>
    <span class="tp-text-muted">Muted</span>
    <span class="tp-text-dim">Dim text</span>`;
  slide.appendChild(texts);

  return slide;
}

function createKakuroSlide() {
  // null = black, {d,a} = clue (d=down sum, a=across sum, 0 = not shown), {v} = answer cell
  const LAYOUT = [
    [null,     null,      {d:14,a:0},  {d:7,a:0},   null     ],
    [null,     {d:0,a:16},{v:'9'},      {v:'7'},      null     ],
    [{d:7,a:0},{d:0,a:7}, {v:'4'},      {v:'3'},      null     ],
    [{d:0,a:6},{v:'4'},   {v:'2'},      null,         null     ],
  ];
  // grid columns = 5
  const COLS = 5;

  const slide = document.createElement('div');
  slide.className = 'tp-slide tp-wrap';
  slide.innerHTML = `
    <div class="tp-header">
      <div class="tp-title">Kakuro</div>
      <div class="tp-scores">
        <div class="tp-score"><div class="tp-score-lbl">LEFT</div><div class="tp-score-val">12</div></div>
      </div>
    </div>`;

  const grid = document.createElement('div');
  grid.className = 'tp-kakuro-grid';
  grid.style.gridTemplateColumns = `repeat(${COLS}, 1fr)`;

  LAYOUT.forEach(row => {
    row.forEach(cell => {
      const el = document.createElement('div');
      el.className = 'tp-kakuro-cell';
      if (cell === null) {
        el.classList.add('tp-kakuro-black');
      } else if (cell.v !== undefined) {
        el.classList.add('tp-kakuro-answer');
        el.textContent = cell.v;
      } else {
        el.classList.add('tp-kakuro-clue');
        if (cell.d) {
          const dn = document.createElement('span');
          dn.className = 'tp-kakuro-num-down';
          dn.textContent = cell.d;
          el.appendChild(dn);
        }
        if (cell.a) {
          const ac = document.createElement('span');
          ac.className = 'tp-kakuro-num-across';
          ac.textContent = cell.a;
          el.appendChild(ac);
        }
      }
      grid.appendChild(el);
    });
  });

  slide.appendChild(grid);

  // Filler row so the slide height roughly matches 2048/Sudoku
  const filler = document.createElement('div');
  filler.style.cssText = 'display:flex;gap:8px;margin-bottom:8px';
  filler.innerHTML = `
    <button class="tp-btn-accent" style="flex:1">New puzzle</button>
    <button class="tp-btn-ghost">Hint</button>`;
  slide.appendChild(filler);

  const texts = document.createElement('div');
  texts.className = 'tp-texts';
  texts.innerHTML = `
    <span class="tp-text-primary">Primary</span>
    <span class="tp-text-muted">Muted</span>
    <span class="tp-text-dim">Dim text</span>`;
  slide.appendChild(texts);

  return slide;
}

/* ── init ── */

function tbInit() {
  // Check URL params for ?edit=custom-xxx
  const params  = new URLSearchParams(location.search);
  const editId  = params.get('edit');
  if (editId) {
    const found = loadCustomThemes().find(t => t.id === editId);
    if (found) draft = { ...found, tokens: { ...found.tokens } };
  }

  // Populate inputs
  document.getElementById('tbThemeName').value = draft.label;
  document.getElementById('tbIconBtn').textContent = draft.icon;
  updateEditingBadge();

  // Render dynamic sections
  renderIconPicker();
  renderEditors();
  renderSavedThemes();
  initPreviewCarousel(); // build slides + wire swipe
  updatePreview();

  // Icon button
  document.getElementById('tbIconBtn').addEventListener('click', toggleIconPicker);

  // Close icon popup on outside click
  document.addEventListener('click', () => {
    const popup = document.getElementById('tbIconPopup');
    if (popup) popup.style.display = 'none';
  });

  // Name input
  document.getElementById('tbThemeName').addEventListener('input', e => {
    draft.label = e.target.value || 'My Theme';
  });

  // Action buttons
  document.getElementById('tbSaveBtn').addEventListener('click', saveTheme);
  document.getElementById('tbExportBtn').addEventListener('click', exportTheme);
  document.getElementById('tbNewBtn').addEventListener('click', resetToNew);

  // Import file input
  document.getElementById('tbImportFile').addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) importTheme(file);
    e.target.value = '';
  });
}

document.addEventListener('DOMContentLoaded', tbInit);
