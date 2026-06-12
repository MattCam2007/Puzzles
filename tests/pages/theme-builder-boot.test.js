// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import { loadPage } from '../helpers/page.js';

describe('theme-builder page boots', () => {
  beforeAll(async () => {
    localStorage.clear();
    loadPage('theme-builder.html');
    await import('../../js/pages/theme-builder.js');
  });

  it('renders token editors for every section + shape rows', () => {
    expect(document.querySelectorAll('#tbEditors .tb-section')).toHaveLength(4);
    expect(document.querySelectorAll('#tbEditors input[type="color"]')).toHaveLength(10);
    expect(document.querySelectorAll('#tbEditors input[type="range"]')).toHaveLength(2);
  });

  it('builds the three preview slides and the icon picker', () => {
    expect(document.querySelectorAll('#tpSlides .tp-slide')).toHaveLength(3);
    expect(document.querySelectorAll('#tbIconPopup .tb-icon-opt').length).toBeGreaterThan(10);
    expect(document.getElementById('tbSavedList').textContent).toContain('No custom themes');
  });

  it('saving creates a custom theme, applies it, and lists it', () => {
    document.getElementById('tbThemeName').value = 'Test Theme';
    document.getElementById('tbSaveBtn').click();
    const customs = JSON.parse(localStorage.getItem('puzzle-custom-themes'));
    expect(customs).toHaveLength(1);
    expect(customs[0].label).toBe('Test Theme');
    expect(customs[0].id).toMatch(/^custom-/);
    expect(localStorage.getItem('puzzle-theme')).toBe(customs[0].id);
    expect(document.documentElement.getAttribute('data-theme')).toBe(customs[0].id);
    expect(document.getElementById('custom-theme-style')).not.toBe(null);
    expect(document.getElementById('tbSavedList').textContent).toContain('Test Theme');
  });

  it('deleting the theme being edited resets the draft so saving cannot resurrect it (B9)', () => {
    const id = JSON.parse(localStorage.getItem('puzzle-custom-themes'))[0].id;
    const confirmOrig = window.confirm;
    window.confirm = () => true;
    document.querySelector(`[data-sa="del"][data-id="${id}"]`).click();
    window.confirm = confirmOrig;

    expect(JSON.parse(localStorage.getItem('puzzle-custom-themes'))).toHaveLength(0);
    expect(document.documentElement.getAttribute('data-theme')).toBe('galaxy');
    // draft was reset to "new" — saving now creates a fresh theme, not the deleted id
    document.getElementById('tbSaveBtn').click();
    const customs = JSON.parse(localStorage.getItem('puzzle-custom-themes'));
    expect(customs).toHaveLength(1);
    expect(customs[0].id).not.toBe(id);
    expect(customs[0].label).toBe('My Theme');
  });

  it('updates the live preview when a token changes', () => {
    const hex = document.querySelector('#tbEditors .tb-hex-input');
    hex.value = '#112233';
    hex.dispatchEvent(new Event('input'));
    expect(document.getElementById('tbPreview').style.cssText).toContain('#112233');
  });
});
