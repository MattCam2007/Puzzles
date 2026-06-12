import { $ } from '../core/dom.js';

/* Win/lose overlay shared by Sudoku and Kakuro (#overlay/#overlayTitle/#overlayMsg). */

export function showOverlay(title, msg) {
  $('#overlayTitle').textContent = title;
  $('#overlayMsg').textContent = msg;
  $('#overlay').classList.add('show');
}

export function hideOverlay() {
  $('#overlay').classList.remove('show');
}

export function overlayVisible() {
  return $('#overlay').classList.contains('show');
}
