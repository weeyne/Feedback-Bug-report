type Attrs = Record<string, string | number | boolean | EventListener | undefined>;
type Child = Node | string | null | undefined | false;

/**
 * Creates an element. `on*` function attributes become event listeners; string children become
 * text nodes, so data can never be parsed as HTML. Listener exceptions are caught here so a bug
 * in the widget's own UI code can never surface as an uncaught error in the host page.
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (typeof value === 'function') {
      const listener = value;
      el.addEventListener(key.slice(2).toLowerCase(), (event) => {
        try {
          listener.call(el, event);
        } catch (error) {
          console.error('[Dymcode]', error);
        }
      });
    } else {
      el.setAttribute(key, value === true ? '' : String(value));
    }
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return el;
}
