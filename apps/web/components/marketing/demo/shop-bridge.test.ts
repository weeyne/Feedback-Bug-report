import type { SubmitPayload } from '@bugping/shared';
import { describe, expect, it, vi } from 'vitest';
import { DEMO_MESSAGE, DEMO_TEXT, isDemoMessage } from './protocol';
import { createDemoSubmit, postToParent, type BridgeWindow } from './shop-bridge';

const ORIGIN = 'https://bugping.app';

function fakeWindow(options: { embedded?: boolean } = {}) {
  const postMessage = vi.fn();
  const timers: Array<{ handler: () => void; ms: number }> = [];
  const win: BridgeWindow = {
    parent: null,
    location: { origin: ORIGIN },
    setTimeout: (handler, ms) => timers.push({ handler, ms }),
  };
  win.parent =
    options.embedded === false ? (win as unknown as BridgeWindow['parent']) : { postMessage };
  return { win, postMessage, timers };
}

const payload = { message: DEMO_TEXT.en } as unknown as SubmitPayload;
const screenshot = new Blob(['shot'], { type: 'image/webp' });

describe('demo shop bridge', () => {
  it('posts to the parent with the page origin as targetOrigin', () => {
    const { win, postMessage } = fakeWindow();
    expect(postToParent(win, { type: DEMO_MESSAGE.ready })).toBe(true);
    expect(postMessage).toHaveBeenCalledWith({ type: 'bugping-demo:ready' }, ORIGIN);
  });

  it('posts nothing when the page is not embedded', () => {
    const { win } = fakeWindow({ embedded: false });
    expect(postToParent(win, { type: DEMO_MESSAGE.ready })).toBe(false);
  });

  it('submit resolves ok after the delay and hands payload and screenshot to the parent', async () => {
    const { win, postMessage, timers } = fakeWindow();
    const submit = createDemoSubmit(win, 600);
    let settled = false;
    const result = submit(payload, screenshot).then((value) => {
      settled = true;
      return value;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(postMessage).not.toHaveBeenCalled();
    expect(timers).toHaveLength(1);
    expect(timers[0]!.ms).toBe(600);

    timers[0]!.handler();
    expect(await result).toEqual({ ok: true });
    expect(postMessage).toHaveBeenCalledWith(
      { type: 'bugping-demo:submitted', payload, screenshot },
      ORIGIN,
    );
  });

  it('submit still succeeds when there is no parent', async () => {
    const { win, timers } = fakeWindow({ embedded: false });
    const result = createDemoSubmit(win)(payload, null);
    timers[0]!.handler();
    expect(await result).toEqual({ ok: true });
  });

  it('isDemoMessage checks both the origin and the type', () => {
    const data = { type: DEMO_MESSAGE.submitted };
    expect(isDemoMessage({ origin: ORIGIN, data }, ORIGIN, DEMO_MESSAGE.submitted)).toBe(true);
    expect(
      isDemoMessage({ origin: 'https://evil.example', data }, ORIGIN, DEMO_MESSAGE.submitted),
    ).toBe(false);
    expect(isDemoMessage({ origin: ORIGIN, data }, ORIGIN, DEMO_MESSAGE.ready)).toBe(false);
    expect(isDemoMessage({ origin: ORIGIN, data: null }, ORIGIN, DEMO_MESSAGE.ready)).toBe(false);
  });
});
