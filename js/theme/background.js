import { STORAGE_KEYS } from '../core/storage.js';

export function applyBgImage(value) {
  if (value) {
    document.documentElement.style.setProperty('--bg-image', `url(${JSON.stringify(value)})`);
    try {
      localStorage.setItem(STORAGE_KEYS.bgImage, value);
    } catch {
      /* data-URL may exceed quota — image still applies for this session */
    }
  } else {
    document.documentElement.style.removeProperty('--bg-image');
    try {
      localStorage.removeItem(STORAGE_KEYS.bgImage);
    } catch {
      /* ignore */
    }
  }
}

export function loadBgImage() {
  const saved = getSavedBgImage();
  if (saved) applyBgImage(saved);
}

export function getSavedBgImage() {
  try {
    return localStorage.getItem(STORAGE_KEYS.bgImage);
  } catch {
    return null;
  }
}

export function applyBoardAlpha(value) {
  document.documentElement.style.setProperty('--board-alpha', `${value}%`);
  try {
    localStorage.setItem(STORAGE_KEYS.boardAlpha, value);
  } catch {
    /* ignore */
  }
}

export function getSavedBoardAlpha() {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.boardAlpha);
    return saved !== null ? parseInt(saved) : 100;
  } catch {
    return 100;
  }
}

export function loadBoardAlpha() {
  document.documentElement.style.setProperty('--board-alpha', `${getSavedBoardAlpha()}%`);
}
