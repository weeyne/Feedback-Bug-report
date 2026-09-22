import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret, safeEqual } from './crypto';

const KEY = Buffer.alloc(32, 1).toString('base64');
const OTHER_KEY = Buffer.alloc(32, 2).toString('base64');

describe('secret encryption', () => {
  it('round-trips and uses the v1 format with a fresh IV', () => {
    const a = encryptSecret('https://discord.com/api/webhooks/1/abc', KEY);
    const b = encryptSecret('https://discord.com/api/webhooks/1/abc', KEY);
    expect(a).toMatch(/^v1:[\w-]+:[\w-]+:[\w-]+$/);
    expect(a).not.toBe(b);
    expect(decryptSecret(a, KEY)).toBe('https://discord.com/api/webhooks/1/abc');
  });

  it('rejects a wrong key', () => {
    expect(() => decryptSecret(encryptSecret('x', KEY), OTHER_KEY)).toThrow();
  });

  it('rejects tampered ciphertext or tag', () => {
    const [v, iv, ct, tag] = encryptSecret('secret-token', KEY).split(':') as [
      string,
      string,
      string,
      string,
    ];
    const flip = (s: string) => (s[0] === 'A' ? 'B' : 'A') + s.slice(1);
    expect(() => decryptSecret([v, iv, flip(ct), tag].join(':'), KEY)).toThrow();
    expect(() => decryptSecret([v, iv, ct, flip(tag)].join(':'), KEY)).toThrow();
  });

  it('rejects unknown versions and malformed tokens', () => {
    const token = encryptSecret('x', KEY);
    expect(() => decryptSecret(token.replace(/^v1/, 'v2'), KEY)).toThrow(/format/);
    expect(() => decryptSecret('garbage', KEY)).toThrow(/format/);
  });

  it('requires a 32-byte key', () => {
    expect(() => encryptSecret('x', Buffer.alloc(16).toString('base64'))).toThrow(/32 bytes/);
  });
});

describe('safeEqual', () => {
  it('compares strings in constant time regardless of length', () => {
    expect(safeEqual('webhook-secret', 'webhook-secret')).toBe(true);
    expect(safeEqual('webhook-secreT', 'webhook-secret')).toBe(false);
    expect(safeEqual('short', 'webhook-secret')).toBe(false);
    expect(safeEqual(null, 'webhook-secret')).toBe(false);
    expect(safeEqual('', '')).toBe(true);
  });
});
