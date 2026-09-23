// Browser-side billing helpers. They take their window and timers as arguments so they can be
// tested without a DOM.

/** The part of `window` that `openPendingTab` uses. */
export interface TabHost {
  open(url: string, target: string): PendingWindow | null;
  location: { assign(url: string): void };
}

interface PendingWindow {
  opener: unknown;
  location: { href: string };
  close(): void;
}

/**
 * Opens a blank tab synchronously, inside the click handler, so that Safari does not block it as
 * a popup once the handler has awaited something. `go` then points it at the URL; if the popup
 * was blocked anyway, the current page navigates instead.
 */
export function openPendingTab(host: TabHost): { go(url: string): void; close(): void } {
  const tab = host.open('', '_blank');
  // The opened page (the Paddle portal) must not be able to reach back into ours.
  if (tab) tab.opener = null;
  return {
    go(url) {
      if (tab) tab.location.href = url;
      else host.location.assign(url);
    },
    close() {
      tab?.close();
    },
  };
}

/**
 * Polls `check` every `intervalMs` until it reports Pro (`onPro`) or `limitMs` has passed
 * (`onSlow`). A rejected check (network or server error) is retried until the limit. Returns a
 * function that stops polling; no callback fires after it is called.
 */
export function pollActivation(opts: {
  check: () => Promise<boolean>;
  onPro: () => void;
  onSlow: () => void;
  intervalMs: number;
  limitMs: number;
  now?: () => number;
}): () => void {
  const now = opts.now ?? Date.now;
  const started = now();
  let stopped = false;
  const timer = setInterval(async () => {
    let pro = false;
    try {
      pro = await opts.check();
    } catch {
      // Retried on the next tick.
    }
    if (stopped) return;
    if (pro) {
      stop();
      opts.onPro();
    } else if (now() - started > opts.limitMs) {
      stop();
      opts.onSlow();
    }
  }, opts.intervalMs);
  function stop() {
    stopped = true;
    clearInterval(timer);
  }
  return stop;
}
