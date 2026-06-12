/* DOM helpers — the only core module allowed to touch the document. */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/**
 * Tiny element builder.
 *   el('div', { className: 'cell', dataset: { row: 1 } }, child, 'text')
 */
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'style') node.style.cssText = value;
    else node[key] = value;
  }
  for (const child of children) {
    node.append(child instanceof Node ? child : String(child));
  }
  return node;
}
