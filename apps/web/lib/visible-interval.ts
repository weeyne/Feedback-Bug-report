export interface VisibleIntervalOptions {
  run: () => Promise<unknown> | unknown;
  intervalMs: number;
  isHidden: () => boolean;
  subscribeVisibility: (onChange: () => void) => () => void;
  setTimer?: typeof setInterval;
  clearTimer?: typeof clearInterval;
  runOnVisible?: boolean;
}

/** Calls `run` every `intervalMs` while visible, never overlapping itself. Returns `stop`. */
export function createVisibleInterval(opts: VisibleIntervalOptions): () => void {
  const setTimer = opts.setTimer ?? setInterval;
  const clearTimer = opts.clearTimer ?? clearInterval;
  let pending = false;

  const attempt = () => {
    if (pending || opts.isHidden()) return;
    pending = true;
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

  const timer = setTimer(attempt, opts.intervalMs);
  const unsubscribe = opts.subscribeVisibility(() => {
    if (opts.runOnVisible && !opts.isHidden()) attempt();
  });

  return () => {
    clearTimer(timer);
    unsubscribe();
  };
}
