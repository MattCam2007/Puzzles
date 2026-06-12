// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { syncThemePicker } from '../../js/theme/theme-picker.js';
import { saveCustomThemesToStorage } from '../../js/theme/custom-themes.js';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.setAttribute('data-theme', 'galaxy');
  document.documentElement.style.removeProperty('--bg-image');
  document.getElementById('custom-theme-style')?.remove();
  // the markup ui/shared-sections.js injects, reduced to what the picker wires
  document.body.innerHTML = `
    <div class="pick-row" data-theme-pick="galaxy"></div>
    <div class="pick-row" data-theme-pick="terminal"></div>
    <div id="customThemesList"></div>
    <input type="range" id="boardAlphaSlider" min="0" max="100" value="100">
    <div class="pick-row" id="bgUploadRow"></div>
    <input type="text" id="bgImageUrl">
    <input type="file" id="bgImageFile">
    <div class="pick-row" id="clearBgBtn"></div>`;
});

describe('built-in theme rows', () => {
  it('marks the active row and switches themes on click', () => {
    syncThemePicker();
    const galaxy = document.querySelector('[data-theme-pick="galaxy"]');
    const terminal = document.querySelector('[data-theme-pick="terminal"]');
    expect(galaxy.classList.contains('selected')).toBe(true);
    terminal.onclick();
    expect(document.documentElement.getAttribute('data-theme')).toBe('terminal');
    expect(terminal.classList.contains('selected')).toBe(true);
    expect(galaxy.classList.contains('selected')).toBe(false);
    expect(localStorage.getItem('puzzle-theme')).toBe('terminal');
  });
});

describe('custom theme rows', () => {
  it('renders saved custom themes with escaped labels and applies on click', () => {
    saveCustomThemesToStorage([
      { id: 'custom-1', icon: '⭐', label: '<b>Evil</b>', tokens: { '--bg': '#111111' } },
    ]);
    syncThemePicker();
    const list = document.getElementById('customThemesList');
    const row = list.querySelector('[data-custom-pick="custom-1"]');
    expect(row).not.toBe(null);
    expect(list.querySelector('b')).toBe(null); // escaped
    row.onclick();
    expect(document.documentElement.getAttribute('data-theme')).toBe('custom-1');
    expect(document.getElementById('custom-theme-style')).not.toBe(null);
    // applyTheme re-renders the list — query the fresh row
    const fresh = list.querySelector('[data-custom-pick="custom-1"]');
    expect(fresh.classList.contains('selected')).toBe(true);
  });
});

describe('background controls', () => {
  it('URL input applies an image and the clear row removes it', () => {
    syncThemePicker();
    const url = document.getElementById('bgImageUrl');
    url.value = ' https://example.com/bg.jpg ';
    url.onchange();
    expect(document.documentElement.style.getPropertyValue('--bg-image')).toBe(
      'url("https://example.com/bg.jpg")',
    );
    expect(document.getElementById('clearBgBtn').classList.contains('selected')).toBe(false);
    expect(url.value).toBe('https://example.com/bg.jpg'); // re-synced, trimmed

    document.getElementById('clearBgBtn').onclick();
    expect(document.documentElement.style.getPropertyValue('--bg-image')).toBe('');
    expect(document.getElementById('clearBgBtn').classList.contains('selected')).toBe(true);
    expect(url.value).toBe('');
  });

  it('an uploaded (data:) image marks the upload row and masks the URL field', () => {
    localStorage.setItem('puzzle-bg-image', 'data:image/png;base64,AAAA');
    syncThemePicker();
    expect(document.getElementById('bgUploadRow').classList.contains('selected')).toBe(true);
    const url = document.getElementById('bgImageUrl');
    expect(url.value).toBe('');
    expect(url.placeholder).toBe('Image uploaded ✓');
  });

  it('the alpha slider reflects the saved value and writes through', () => {
    localStorage.setItem('puzzle-board-alpha', '40');
    syncThemePicker();
    const slider = document.getElementById('boardAlphaSlider');
    expect(slider.value).toBe('40');
    slider.value = '70';
    slider.oninput();
    expect(document.documentElement.style.getPropertyValue('--board-alpha')).toBe('70%');
    expect(localStorage.getItem('puzzle-board-alpha')).toBe('70');
  });

  it('a file chosen via the hidden input is read and applied as a data URL', async () => {
    syncThemePicker();
    const fileInput = document.getElementById('bgImageFile');
    const file = new File(['fake-bytes'], 'bg.png', { type: 'image/png' });
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
    fileInput.onchange();
    await new Promise((resolve) => setTimeout(resolve, 50)); // FileReader is async
    expect(localStorage.getItem('puzzle-bg-image')).toMatch(/^data:/);
    expect(document.documentElement.style.getPropertyValue('--bg-image')).toMatch(/^url\("data:/);
  });
});
