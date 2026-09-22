import { withTx } from '@dymcode/db-tests/harness';
import { describe, expect, it } from 'vitest';
import type { Db } from './types';

describe('test harness', () => {
  it('provides a Db-compatible connection with migrations applied', () =>
    withTx(async (harnessDb) => {
      const db: Db = harnessDb;
      const rows = await db.query<{ n: number }>('select count(*)::int as n from public.projects');
      expect(rows).toEqual([{ n: 0 }]);
    }));
});
