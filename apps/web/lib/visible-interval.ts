export interface VisibleIntervalOptions {
  run: () => Promise<unknown> | unknown;
  intervalMs: number;
  isHidden: () => boolean;
  subscribeVisibility: (onChange: () => void) => () => void;
  runOnVisible?: boolean;
  now?: () => number;
}

/** Calls `run` every `intervalMs` while visible, never overlapping itself. Returns `stop`. */
export function createVisibleInterval(opts: VisibleIntervalOptions): () => void {
  const now = opts.now ?? Date.now;
  let pending = false;
  let lastRun = -Infinity;

  const attempt = (minGapMs: number) => {
    if (pending || opts.isHidden() || now() - lastRun < minGapMs) return;
    pending = true;
    lastRun = now();
    void (async () => {
      try {
        await opts.run();
      } catch {
        // a failed run must not stop later ticks
      } finally {
        pending = false;
      }
    })();
  };

  // A tick right after a visible-return run would refresh twice in a row.
  const timer = setInterval(() => attempt(opts.intervalMs / 2), opts.intervalMs);
  const unsubscribe = opts.subscribeVisibility(() => {
    if (opts.runOnVisible) attempt(opts.intervalMs);
  });

  return () => {
    clearInterval(timer);
    unsubscribe();
  };
}
