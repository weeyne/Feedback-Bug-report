import { describe, expect, it, vi } from 'vitest';
import type postgres from 'postgres';
import { wrap } from './postgres';

/** A minimal fake standing in for postgres.js's `Sql`/`TransactionSql`. */
function fakeSql(overrides: Record<string, unknown> = {}) {
  return { unsafe: vi.fn(async () => []), ...overrides } as unknown as postgres.Sql;
}

describe('wrap', () => {
  it('throws when transaction() is called on an already-open transaction', async () => {
    // No `begin` property: this is what postgres.js hands the callback inside `sql.begin`.
    const tx = fakeSql();
    const db = wrap(tx);
    await expect(db.transaction(async () => 1)).rejects.toThrow(
      /nested transactions are not supported/,
    );
  });

  it('opens a real transaction via sql.begin at the top level', async () => {
    const begin = vi.fn(async (fn: (tx: postgres.Sql) => unknown) => fn(fakeSql()));
    const top = fakeSql({ begin });
    const db = wrap(top);
    const result = await db.transaction(async (tx) => {
      await tx.query('select 1');
      return 42;
    });
    expect(result).toBe(42);
    expect(begin).toHaveBeenCalledTimes(1);
  });
});
