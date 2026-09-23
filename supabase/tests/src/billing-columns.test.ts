import { describe, expect, it } from 'vitest';
import { withTx } from './db';
import { createUser } from './fixtures';

describe('subscriptions Paddle columns', () => {
  it('has the Paddle columns and no Lemon Squeezy columns', () =>
    withTx(async (db) => {
      const rows = await db.query<{ column_name: string }>(
        `select column_name from information_schema.columns
         where table_schema = 'public' and table_name = 'subscriptions' order by column_name`,
      );
      const names = rows.map((r) => r.column_name);
      for (const name of [
        'paddle_customer_id',
        'paddle_subscription_id',
        'paddle_transaction_id',
        'paddle_occurred_at',
        'cancel_at_period_end',
      ]) {
        expect(names).toContain(name);
      }
      expect(names.filter((n) => n.startsWith('ls_'))).toEqual([]);
    }));

  it('keeps Paddle ids unique and defaults cancel_at_period_end to false', () =>
    withTx(async (db) => {
      const uid = await createUser(db);
      await db.query(
        `insert into public.subscriptions (user_id, plan, status, paddle_subscription_id)
         values ($1, 'pro_monthly', 'active', 'sub_1')`,
        [uid],
      );
      const [row] = await db.query<{ cancel_at_period_end: boolean }>(
        `select cancel_at_period_end from public.subscriptions where paddle_subscription_id = 'sub_1'`,
      );
      expect(row).toEqual({ cancel_at_period_end: false });
      await expect(
        db.query(
          `insert into public.subscriptions (user_id, plan, status, paddle_subscription_id)
           values ($1, 'pro_monthly', 'active', 'sub_1')`,
          [uid],
        ),
      ).rejects.toThrow();
    }));
});
