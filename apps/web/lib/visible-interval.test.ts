import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createVisibleInterval } from './visible-interval';

function visibility(initiallyHidden = false) {
  let hidden = initiallyHidden;
  const listeners = new Set<() => void>();
  return {
    isHidden: () => hidden,
    subscribeVisibility: (onChange: () => void) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    set(next: boolean) {
      hidden = next;
      listeners.forEach((l) => l());
    },
    listenerCount: () => listeners.size,
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('createVisibleInterval', () => {
  it('runs on every tick while visible', async () => {
    const run = vi.fn();
    const stop = createVisibleInterval({ run, intervalMs: 1000, ...visibility() });
    await vi.advanceTimersByTimeAsync(3000);
    expect(run).toHaveBeenCalledTimes(3);
    stop();
  });

  it('skips ticks while hidden', async () => {
    const run = vi.fn();
    const v = visibility(true);
    const stop = createVisibleInterval({ run, intervalMs: 1000, ...v });
    await vi.advanceTimersByTimeAsync(3000);
    expect(run).not.toHaveBeenCalled();
    v.set(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(1);
    stop();
  });

  it('never overlaps a slow run', async () => {
    let calls = 0;
    const run = vi.fn(() => {
      calls++;
      return new Promise((resolve) => setTimeout(resolve, 2500));
    });
    const stop = createVisibleInterval({ run, intervalMs: 1000, ...visibility() });
    await vi.advanceTimersByTimeAsync(2000);
    expect(calls).toBe(1);
    await vi.advanceTimersByTimeAsync(1000); // the run started at 1000 and settles at 3500
    expect(calls).toBe(1);
    await vi.advanceTimersByTimeAsync(1000); // tick at 4000 after the run settled
    expect(calls).toBe(2);
    stop();
  });

  it('runs once immediately on becoming visible when runOnVisible is set', async () => {
    const run = vi.fn();
    const v = visibility(true);
    const stop = createVisibleInterval({ run, intervalMs: 10_000, runOnVisible: true, ...v });
    v.set(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);
    v.set(true); // going hidden does not run
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);
    stop();
  });

  it('does not run on becoming visible without runOnVisible', async () => {
    const run = vi.fn();
    const v = visibility(true);
    const stop = createVisibleInterval({ run, intervalMs: 10_000, ...v });
    v.set(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(run).not.toHaveBeenCalled();
    stop();
  });

  it('respects the in-flight guard on becoming visible', async () => {
    const run = vi.fn(() => new Promise((resolve) => setTimeout(resolve, 5000)));
    const v = visibility(false);
    const stop = createVisibleInterval({ run, intervalMs: 1000, runOnVisible: true, ...v });
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(1);
    v.set(true);
    v.set(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);
    stop();
  });

  it('keeps ticking after a rejected run', async () => {
    const run = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue(undefined);
    const stop = createVisibleInterval({ run, intervalMs: 1000, ...visibility() });
    await vi.advanceTimersByTimeAsync(3000);
    expect(run).toHaveBeenCalledTimes(3);
    stop();
  });

  it('keeps ticking after a run that throws synchronously', async () => {
    const run = vi.fn(() => {
      throw new Error('boom');
    });
    const stop = createVisibleInterval({ run, intervalMs: 1000, ...visibility() });
    await vi.advanceTimersByTimeAsync(2000);
    expect(run).toHaveBeenCalledTimes(2);
    stop();
  });

  it('stop clears the timer and unsubscribes', async () => {
    const run = vi.fn();
    const v = visibility();
    const stop = createVisibleInterval({ run, intervalMs: 1000, runOnVisible: true, ...v });
    expect(v.listenerCount()).toBe(1);
    stop();
    expect(v.listenerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(5000);
    v.set(true);
    v.set(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(run).not.toHaveBeenCalled();
  });

  describe('throttling around visible-return runs', () => {
    it('does not refresh on becoming visible when a run started less than one interval ago', async () => {
      let t = 0;
      const run = vi.fn();
      const v = visibility(false);
      const stop = createVisibleInterval({
        run,
        intervalMs: 1000,
        runOnVisible: true,
        now: () => t,
        ...v,
      });
      t = 1000;
      await vi.advanceTimersByTimeAsync(1000);
      expect(run).toHaveBeenCalledTimes(1);
      t = 1500; // 500 ms after the last run
      v.set(true);
      v.set(false);
      await vi.advanceTimersByTimeAsync(0);
      expect(run).toHaveBeenCalledTimes(1);
      t = 2000; // a full interval since the last run
      v.set(true);
      v.set(false);
      await vi.advanceTimersByTimeAsync(0);
      expect(run).toHaveBeenCalledTimes(2);
      stop();
    });

    it('skips a timer tick right after a visible-return run', async () => {
      let t = 0;
      const run = vi.fn();
      const v = visibility(true);
      const stop = createVisibleInterval({
        run,
        intervalMs: 1000,
        runOnVisible: true,
        now: () => t,
        ...v,
      });
      t = 900;
      await vi.advanceTimersByTimeAsync(900);
      v.set(false); // visible-return run at t=900
      await vi.advanceTimersByTimeAsync(0);
      expect(run).toHaveBeenCalledTimes(1);
      t = 1000;
      await vi.advanceTimersByTimeAsync(100); // tick at 1000, only 100 ms after the run
      expect(run).toHaveBeenCalledTimes(1);
      t = 2000;
      await vi.advanceTimersByTimeAsync(1000); // next tick is a full interval away
      expect(run).toHaveBeenCalledTimes(2);
      stop();
    });
  });
});
