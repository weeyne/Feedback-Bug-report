import { describe, expect, it, vi } from 'vitest';
import { createAnnotateLoader, createChunkLoader } from './chunk-loader';

describe('createChunkLoader', () => {
  it('imports once and memoizes the picked export', async () => {
    const importer = vi.fn(async () => ({ run: () => 1 }));
    const load = createChunkLoader(
      'https://x/a.js',
      (m) => (m as { run?: () => number }).run ?? null,
      importer,
    );
    const [a, b] = await Promise.all([load(), load()]);
    expect(a).toBe(b);
    expect(importer).toHaveBeenCalledTimes(1);
  });
  it('resolves null on import failure or a missing export', async () => {
    expect(
      await createChunkLoader(
        'u',
        () => 1,
        async () => Promise.reject(new Error('net')),
      )(),
    ).toBeNull();
    expect(
      await createChunkLoader(
        'u',
        () => null,
        async () => ({}),
      )(),
    ).toBeNull();
  });
});

describe('createAnnotateLoader', () => {
  it('returns the annotate function', async () => {
    const annotate = async () => null;
    expect(await createAnnotateLoader('u', async () => ({ annotate }))()).toBe(annotate);
    expect(await createAnnotateLoader('u', async () => ({ annotate: 'x' }))()).toBeNull();
  });
});
