import { describe, expect, it, vi } from 'vitest';
import { createScreenshotLoader } from './screenshot-loader';

describe('createScreenshotLoader', () => {
  it('imports the module once and returns its capture function', async () => {
    const capture = vi.fn(async () => null);
    const importer = vi.fn(async () => ({ capture }));
    const load = createScreenshotLoader('https://bugping.app/w/screenshot.js?v=1', importer);
    await expect(load()).resolves.toBe(capture);
    await expect(load()).resolves.toBe(capture);
    expect(importer).toHaveBeenCalledOnce();
    expect(importer).toHaveBeenCalledWith('https://bugping.app/w/screenshot.js?v=1');
  });

  it('resolves null when the import fails or has no capture export', async () => {
    const failing = createScreenshotLoader('u', async () => {
      throw new Error('blocked by CSP');
    });
    await expect(failing()).resolves.toBeNull();
    const empty = createScreenshotLoader('u', async () => ({}));
    await expect(empty()).resolves.toBeNull();
  });
});
