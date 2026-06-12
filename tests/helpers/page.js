import { readFileSync } from 'fs';
import { resolve } from 'path';

/** Load a real page's body markup into jsdom (script tags stay inert). */
export function loadPage(name) {
  const html = readFileSync(resolve(process.cwd(), name), 'utf8');
  const body = html.match(/<body>([\s\S]*)<\/body>/)[1].replace(/<script[\s\S]*?<\/script>/g, '');
  document.body.innerHTML = body;
}

/** jsdom has no canvas/Web Animations — stub just enough for boot + moves. */
export function stubCanvasAndAnimations() {
  const ctx2d = {
    clearRect() {},
    beginPath() {},
    arc() {},
    fill() {},
    stroke() {},
    save() {},
    restore() {},
    translate() {},
    rotate() {},
    fillRect() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    createRadialGradient: () => ({ addColorStop() {} }),
  };
  window.HTMLCanvasElement.prototype.getContext = () => ctx2d;
  if (!window.Element.prototype.animate) {
    window.Element.prototype.animate = () => ({ finished: Promise.resolve() });
  }
}
