// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { initSettingsPanel, bindToggle, isTypingTarget } from '../../js/ui/settings-panel.js';

beforeEach(() => {
  document.body.innerHTML = `
    <div class="icon-btn" id="settingsBtn"></div>
    <div class="settings-backdrop" id="settingsBackdrop"></div>
    <div class="settings-panel" id="settingsPanel"></div>`;
});

describe('initSettingsPanel', () => {
  it('opens on the gear button, calling onOpen first', () => {
    const calls = [];
    const onOpen = vi.fn(() => {
      calls.push(document.getElementById('settingsPanel').classList.contains('show'));
    });
    const panel = initSettingsPanel({ onOpen });
    document.getElementById('settingsBtn').click();
    expect(onOpen).toHaveBeenCalledOnce();
    expect(calls).toEqual([false]); // onOpen ran before the panel showed
    expect(panel.isOpen()).toBe(true);
    expect(document.getElementById('settingsBackdrop').classList.contains('show')).toBe(true);
  });

  it('closes on backdrop click', () => {
    const panel = initSettingsPanel();
    panel.open();
    document.getElementById('settingsBackdrop').click();
    expect(panel.isOpen()).toBe(false);
    expect(document.getElementById('settingsBackdrop').classList.contains('show')).toBe(false);
  });

  it('open/close are also callable directly', () => {
    const panel = initSettingsPanel();
    panel.open();
    expect(panel.isOpen()).toBe(true);
    panel.close();
    expect(panel.isOpen()).toBe(false);
  });
});

describe('bindToggle', () => {
  it('initializes from the getter and writes through the setter', () => {
    document.body.innerHTML = '<input type="checkbox" id="tog">';
    const cfg = { flag: true };
    const after = vi.fn();
    bindToggle(
      'tog',
      () => cfg.flag,
      (v) => (cfg.flag = v),
      after,
    );
    const input = document.getElementById('tog');
    expect(input.checked).toBe(true);
    input.checked = false;
    input.dispatchEvent(new Event('change'));
    expect(cfg.flag).toBe(false);
    expect(after).toHaveBeenCalledOnce();
  });
});

describe('isTypingTarget', () => {
  it('is true for inputs/selects/textareas, false otherwise', () => {
    expect(isTypingTarget(document.createElement('input'))).toBe(true);
    expect(isTypingTarget(document.createElement('select'))).toBe(true);
    expect(isTypingTarget(document.createElement('textarea'))).toBe(true);
    expect(isTypingTarget(document.createElement('div'))).toBe(false);
    expect(isTypingTarget(document.body)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
