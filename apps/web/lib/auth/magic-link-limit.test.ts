import { withTx } from '@bugping/db-tests/harness';
import { describe, expect, it } from 'vitest';
import { magicLinkLimited } from './magic-link-limit';

const SALT = 'test-salt-0123456789abcdef';

describe('magicLinkLimited', () => {
  it('allows 5 requests per IP per window', () =>
    withTx(async (db) => {
      for (let i = 0; i < 5; i++) {
        expect(await magicLinkLimited(db, SALT, '203.0.113.7', `u${i}@example.com`)).toBe(false);
      }
      expect(await magicLinkLimited(db, SALT, '203.0.113.7', 'u9@example.com')).toBe(true);
      expect(await magicLinkLimited(db, SALT, '198.51.100.1', 'u8@example.com')).toBe(false);
    }));

  it('allows 3 requests per address per window, case-insensitively', () =>
    withTx(async (db) => {
      expect(await magicLinkLimited(db, SALT, '203.0.113.1', 'ann@example.com')).toBe(false);
      expect(await magicLinkLimited(db, SALT, '203.0.113.2', 'Ann@Example.com')).toBe(false);
      expect(await magicLinkLimited(db, SALT, '203.0.113.3', 'ANN@example.com')).toBe(false);
      expect(await magicLinkLimited(db, SALT, '203.0.113.4', 'ann@example.com')).toBe(true);
    }));

  it('stores only hashes of the IP and the address', () =>
    withTx(async (db) => {
      await magicLinkLimited(db, SALT, '203.0.113.7', 'ann@example.com');
      const rows = await db.query<{ key: string }>(
        `select key from public.rate_limits where key like 'magic-%' order by key`,
      );
      expect(rows).toHaveLength(2);
      for (const { key } of rows) {
        expect(key).toMatch(/^magic-(ip|email):[0-9a-f]{64}$/);
      }
    }));
});
