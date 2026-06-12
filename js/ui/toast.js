/** Toast notifications bound to an element (currently kakuro's #toast). */
export function createToast(toastEl) {
  let timer = null;
  return function toast(msg, kind, ms) {
    toastEl.textContent = msg;
    toastEl.className = 'toast show' + (kind ? ' ' + kind : '');
    clearTimeout(timer);
    timer = setTimeout(() => toastEl.classList.remove('show'), ms || 1300);
  };
}
