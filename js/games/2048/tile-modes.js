/* Tile label modes — pure lookup tables. */

export const TILE_MODES = [
  {
    id: 'numbers',
    icon: '🔢',
    label: 'Numbers',
    render: (v) => ({ text: String(v), cls: '' }),
  },
  {
    id: 'roman',
    icon: '🏛️',
    label: 'Roman',
    render: (v) => {
      const map = {
        2: 'II',
        4: 'IV',
        8: 'VIII',
        16: 'XVI',
        32: 'XXXII',
        64: 'LXIV',
        128: 'CXXVIII',
        256: 'CCLVI',
        512: 'DXII',
        1024: 'MXX',
        2048: 'MMX',
        4096: 'MVM',
      };
      return { text: map[v] || String(v), cls: '' };
    },
  },
  {
    id: 'hex',
    icon: '💻',
    label: 'Hex',
    render: (v) => ({ text: '0x' + v.toString(16).toUpperCase(), cls: '' }),
  },
  {
    id: 'binary',
    icon: '⚙️',
    label: 'Binary',
    render: (v) => ({ text: v.toString(2), cls: '' }),
  },
  {
    id: 'greek',
    icon: '🔮',
    label: 'Greek',
    render: (v) => {
      const map = {
        2: 'α',
        4: 'β',
        8: 'γ',
        16: 'δ',
        32: 'ε',
        64: 'ζ',
        128: 'η',
        256: 'θ',
        512: 'ι',
        1024: 'λ',
        2048: 'Ω',
        4096: '∞',
      };
      return { text: map[v] || '?', cls: 'tile-mode-greek' };
    },
  },
  {
    id: 'cursed',
    icon: '💀',
    label: 'Cursed Emoji',
    render: (v) => {
      const map = {
        2: '💀',
        4: '👁️',
        8: '🤡',
        16: '👾',
        32: '🔥',
        64: '💅',
        128: '🌈',
        256: '😈',
        512: '🦑',
        1024: '🧿',
        2048: '⚗️',
        4096: '🕳️',
      };
      return { text: map[v] || '👁️', cls: 'tile-mode-emoji' };
    },
  },
  {
    id: 'occult',
    icon: '🌙',
    label: 'Occult Sigils',
    render: (v) => {
      // Combining alchemical / astrological / runic symbols
      const map = {
        2: '☽',
        4: '☿',
        8: '♀',
        16: '♂',
        32: '♃',
        64: '♄',
        128: '⛎',
        256: 'ᚦ',
        512: 'ᚷ',
        1024: 'ᚹ',
        2048: 'ᛟ',
        4096: '⛧',
      };
      return { text: map[v] || '✦', cls: 'tile-mode-occult', glow: true };
    },
  },
];

export function tileLabel(val, modeId) {
  const mode = TILE_MODES.find((m) => m.id === modeId) || TILE_MODES[0];
  return mode.render(val);
}
