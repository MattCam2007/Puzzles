import { $ } from '../core/dom.js';

/**
 * Wires the ⚙️ button, sheet and backdrop shared by all pages.
 * `onOpen` runs before the panel shows (games sync their toggles there).
 */
export function initSettingsPanel({ onOpen } = {}) {
  const panel = $('#settingsPanel');
  const backdrop = $('#settingsBackdrop');
  const open = () => {
    onOpen?.();
    backdrop.classList.add('show');
    panel.classList.add('show');
  };
  const close = () => {
    backdrop.classList.remove('show');
    panel.classList.remove('show');
  };
  $('#settingsBtn').addEventListener('click', open);
  backdrop.addEventListener('click', close);
  return { open, close, isOpen: () => panel.classList.contains('show') };
}

/** Generic checkbox → config binder (replaces the games' onToggle copies). */
export function bindToggle(id, get, set, after) {
  const input = $('#' + id);
  input.addEventListener('change', (e) => {
    set(e.target.checked);
    after?.();
  });
  input.checked = get();
}

/** True when the event target is a place users type — keyboard handlers must not steal it. */
export function isTypingTarget(target) {
  return (
    target instanceof Element && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
  );
}
