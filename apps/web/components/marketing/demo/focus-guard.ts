/** The slice of the DOM the focus guard needs; injectable for tests. */
export interface FocusGuardHost {
  document: {
    activeElement: unknown;
    addEventListener(type: 'focusin' | 'focusout', listener: (event: Event) => void): void;
    removeEventListener(type: 'focusin' | 'focusout', listener: (event: Event) => void): void;
  };
  addEventListener(type: 'blur', listener: () => void): void;
  removeEventListener(type: 'blur', listener: () => void): void;
  setTimeout(handler: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

interface Focusable {
  isConnected?: boolean;
  focus(options?: FocusOptions): void;
  blur(): void;
}

/**
 * Keeps keyboard focus out of the demo stage. The stage is `inert`, but Chromium still lets the
 * real widget inside a demo iframe call `focus()` (it focuses its panel when it opens), which
 * makes that iframe the landing's `document.activeElement`: keys would scroll the iframe, not the
 * page, and a focused landing control would lose focus. Whenever focus lands inside `root`, it
 * goes back to the element that just lost it (without scrolling), or to the page body.
 * Returns the cleanup.
 */
export function installFocusGuard(root: { contains(node: unknown): boolean }, win: FocusGuardHost) {
  const doc = win.document;
  /** The landing element that lost focus since the last check. */
  let previous: Focusable | null = null;
  let pending: unknown = null;

  const check = () => {
    pending = null;
    const lost = previous;
    previous = null;
    const active = doc.activeElement as Focusable | null;
    if (!active || !root.contains(active)) return;
    if (lost && lost.isConnected !== false) lost.focus({ preventScroll: true });
    else active.blur();
  };
  const schedule = () => {
    if (pending === null) pending = win.setTimeout(check, 0);
  };
  const onFocusOut = (event: Event) => {
    const target = event.target as Focusable | null;
    if (target && !root.contains(target) && typeof target.focus === 'function') previous = target;
    schedule();
  };

  doc.addEventListener('focusin', schedule);
  doc.addEventListener('focusout', onFocusOut);
  win.addEventListener('blur', schedule);
  return () => {
    doc.removeEventListener('focusin', schedule);
    doc.removeEventListener('focusout', onFocusOut);
    win.removeEventListener('blur', schedule);
    if (pending !== null) win.clearTimeout(pending);
    pending = null;
  };
}
