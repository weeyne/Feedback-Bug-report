import { describe, expect, it } from 'vitest';
import { createMemoryStorage } from './storage';

describe('memory storage', () => {
  it('uploads, downloads and removes files', async () => {
    const storage = createMemoryStorage();
    await storage.upload('p/1.webp', new Uint8Array([1, 2]), 'image/webp');
    expect(await storage.download('p/1.webp')).toEqual({
      data: new Uint8Array([1, 2]),
      contentType: 'image/webp',
    });
    expect(await storage.remove(['p/1.webp', 'p/missing.webp'])).toEqual(['p/1.webp']);
    expect(await storage.download('p/1.webp')).toBeNull();
  });

  it('can simulate failures', async () => {
    const storage = createMemoryStorage();
    storage.failUploads = true;
    await expect(storage.upload('a', new Uint8Array(), 'image/png')).rejects.toThrow();
    storage.failUploads = false;
    await storage.upload('a', new Uint8Array(), 'image/png');
    await storage.upload('b', new Uint8Array(), 'image/png');
    storage.failRemovals.add('b');
    expect(await storage.remove(['a', 'b'])).toEqual(['a']);
    expect(storage.files.has('b')).toBe(true);
  });
});

describe('memory storage signed urls', () => {
  it('returns a data URL for existing files and null otherwise', async () => {
    const storage = createMemoryStorage();
    await storage.upload('p/1.webp', new Uint8Array([1, 2, 3]), 'image/webp');
    expect(await storage.signedUrl('p/1.webp', 300)).toBe('data:image/webp;base64,AQID');
    expect(await storage.signedUrl('p/missing.webp', 300)).toBeNull();
  });
});
