/* Theme-builder shared state: token metadata + the draft being edited. */

export const TOKEN_SECTIONS = [
  {
    label: 'Surfaces',
    tokens: [
      { key: '--bg', label: 'Background' },
      { key: '--surface', label: 'Surface' },
      { key: '--surface2', label: 'Surface 2' },
      { key: '--surface3', label: 'Border / Divider' },
      { key: '--cell-empty', label: 'Empty Cell' },
    ],
  },
  {
    label: 'Accents',
    tokens: [
      { key: '--accent', label: 'Accent (primary)' },
      { key: '--accent2', label: 'Accent 2 (secondary)' },
    ],
  },
  {
    label: 'Text',
    tokens: [
      { key: '--text', label: 'Primary text' },
      { key: '--text-muted', label: 'Muted text' },
      { key: '--text-dim', label: 'Dim text' },
    ],
  },
];

export const GALAXY_DEFAULTS = {
  '--bg': '#0f0f13',
  '--surface': '#1a1a24',
  '--surface2': '#22222f',
  '--surface3': '#2a2a3a',
  '--cell-empty': '#1e1e2a',
  '--accent': '#7c6af7',
  '--accent2': '#c084fc',
  '--text': '#e8e6f0',
  '--text-muted': '#6b6880',
  '--text-dim': '#9b97b8',
  '--radius': '10px',
  '--radius-sm': '6px',
};

export const ICONS = [
  '🎨',
  '🌈',
  '⭐',
  '🔥',
  '🌙',
  '☀️',
  '🌊',
  '🌿',
  '🍇',
  '🦋',
  '🎭',
  '🎪',
  '💎',
  '🏔️',
  '🌺',
  '🎸',
  '🚀',
  '🌵',
  '🦄',
  '🎯',
];

export function newDraft() {
  return { id: null, label: 'My Theme', icon: '🎨', tokens: { ...GALAXY_DEFAULTS } };
}

/** The draft being edited — modules read editor.draft, replace via setDraft. */
export const editor = { draft: newDraft() };

export function setDraft(draft) {
  editor.draft = draft;
}

export function isValidHex(v) {
  return /^#[0-9a-fA-F]{6}$/.test(v);
}
