import { describe, expect, it, vi } from 'vitest';
import { createPublicApi, type ApiState } from './public-api';
import type { WidgetHandle } from './ui/mount';

const fakeHandle = () =>
  ({
    host: document.createElement('div'),
    open: vi.fn(),
    close: vi.fn(),
    isOpen: vi.fn(() => false),
    identify: vi.fn(),
    destroy: vi.fn(),
  }) satisfies WidgetHandle;

describe('createPublicApi', () => {
  it('warns instead of opening before the widget is ready', () => {
    const warn = vi.fn();
    createPublicApi({ handle: null, user: undefined }, warn).open('idea');
    expect(warn).toHaveBeenCalledOnce();
  });

  it('opens a valid type directly; an invalid or missing type opens the home screen', () => {
    const handle = fakeHandle();
    const api = createPublicApi({ handle, user: undefined }, vi.fn());
    api.open('idea');
    api.open('nonsense' as never);
    api.open();
    expect(handle.open.mock.calls).toEqual([['idea'], [], []]);
  });

  it('stores the identified user and forwards the email', () => {
    const handle = fakeHandle();
    const state: ApiState = { handle, user: undefined };
    createPublicApi(state, vi.fn()).identify({ email: 'a@b.co', id: 'u_1' });
    expect(state.user).toEqual({ email: 'a@b.co', id: 'u_1' });
    expect(handle.identify).toHaveBeenCalledWith({ email: 'a@b.co', id: 'u_1' });
  });

  it('rejects malformed identify input with a warning', () => {
    const warn = vi.fn();
    const state: ApiState = { handle: null, user: undefined };
    const api = createPublicApi(state, warn);
    api.identify({ id: 42 } as never);
    api.identify(null as never);
    expect(state.user).toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('never throws into the host page', () => {
    const handle = {
      ...fakeHandle(),
      open: () => {
        throw new Error('boom');
      },
    };
    expect(() => createPublicApi({ handle, user: undefined }, vi.fn()).open('bug')).not.toThrow();
  });
});
