import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openPendingTab, pollActivation, type TabHost } from './browser';

function host(blocked = false) {
  const tab = { opener: {} as unknown, location: { href: '' }, close: vi.fn() };
  const win = {
    open: vi.fn(() => (blocked ? null : tab)),
    location: { assign: vi.fn() },
  } satisfies TabHost;
  return { tab, win };
}

describe('openPendingTab', () => {
  it('opens a blank tab at once, detaches it, then points it at the URL', () => {
    const { tab, win } = host();
    const pending = openPendingTab(win);
    expect(win.open).toHaveBeenCalledWith('', '_blank');
    expect(tab.opener).toBeNull();
    pending.go('https://portal.example/o');
    expect(tab.location.href).toBe('https://portal.example/o');
    expect(win.location.assign).not.toHaveBeenCalled();
    expect(tab.close).not.toHaveBeenCalled();
  });

  it('closes the tab on error', () => {
    const { tab, win } = host();
    openPendingTab(win).close();
    expect(tab.close).toHaveBeenCalledOnce();
  });

  it('navigates the current page when the popup was blocked', () => {
    const { win } = host(true);
    const pending = openPendingTab(win);
    pending.go('https://portal.example/o');
    expect(win.location.assign).toHaveBeenCalledWith('https://portal.example/o');
    expect(() => pending.close()).not.toThrow();
  });
});

describe('pollActivation', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const poll = (check: () => Promise<boolean>) => {
    const onPro = vi.fn();
    const onSlow = vi.fn();
    const stop = pollActivation({ check, onPro, onSlow, intervalMs: 2000, limitMs: 60_000 });
    return { onPro, onSlow, stop };
  };

  it('keeps polling after rejected checks until Pro is active', async () => {
    const check = vi
      .fn<() => Promise<boolean>>()
      .mockRejectedValueOnce(new Error('network'))
      .mockRejectedValueOnce(new Error('server'))
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true);
    const { onPro, onSlow } = poll(check);
    await vi.advanceTimersByTimeAsync(6000);
    expect(onPro).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2000);
    expect(onPro).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(check).toHaveBeenCalledTimes(4);
    expect(onSlow).not.toHaveBeenCalled();
  });

  it('gives up after the limit when every check fails', async () => {
    const check = vi.fn<() => Promise<boolean>>().mockRejectedValue(new Error('down'));
    const { onPro, onSlow } = poll(check);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(onSlow).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2000);
    expect(onSlow).toHaveBeenCalledOnce();
    expect(onPro).not.toHaveBeenCalled();
    const calls = check.mock.calls.length;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(check).toHaveBeenCalledTimes(calls);
  });

  it('fires nothing after it is stopped, even for a check in flight', async () => {
    let resolve: (pro: boolean) => void = () => {};
    const check = vi.fn(() => new Promise<boolean>((r) => (resolve = r)));
    const { onPro, stop } = poll(check);
    await vi.advanceTimersByTimeAsync(2000);
    expect(check).toHaveBeenCalledOnce();
    stop();
    resolve(true);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(onPro).not.toHaveBeenCalled();
    expect(check).toHaveBeenCalledOnce();
  });
});
