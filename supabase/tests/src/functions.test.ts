import { describe, expect, it } from 'vitest';
import { withTx } from './db';
import { createUser, grantPro } from './fixtures';

describe('is_pro', () => {
  it('is false without subscriptions', () =>
    withTx(async (db) => {
      const uid = await createUser(db);
      const [row] = await db.query('select public.is_pro($1) as pro', [uid]);
      expect(row).toEqual({ pro: false });
    }));

  it.each([
    ['pro_lifetime', 'paid', null, true],
    ['pro_lifetime', 'refunded', null, false],
    ['pro_monthly', 'active', '1 month', true],
    ['pro_monthly', 'on_trial', '7 days', true],
    ['pro_monthly', 'past_due', '-1 day', true],
    ['pro_monthly', 'cancelled', '1 day', true],
    ['pro_monthly', 'cancelled', '-1 day', false],
    ['pro_monthly', 'expired', '-1 day', false],
    ['pro_monthly', 'unpaid', '-1 day', false],
  ] as const)('%s / %s (period end %s) -> %s', (plan, status, periodEnd, expected) =>
    withTx(async (db) => {
      const uid = await createUser(db);
      await grantPro(db, uid, { plan, status, periodEnd });
      const [row] = await db.query('select public.is_pro($1) as pro', [uid]);
      expect(row).toEqual({ pro: expected });
    }),
  );

  it('current_user_is_pro reflects the signed-in user', () =>
    withTx(async (db) => {
      const pro = await createUser(db);
      const free = await createUser(db);
      await grantPro(db, pro);
      await db.asUser(pro);
      expect(await db.query('select public.current_user_is_pro() as pro')).toEqual([{ pro: true }]);
      await db.asUser(free);
      expect(await db.query('select public.current_user_is_pro() as pro')).toEqual([
        { pro: false },
      ]);
    }));
});

describe('consume_quota', () => {
  it('increments per owner for the current month', () =>
    withTx(async (db) => {
      const a = await createUser(db);
      const b = await createUser(db);
      const consume = async (uid: string) =>
        (await db.query<{ n: number }>('select public.consume_quota($1) as n', [uid]))[0]?.n;
      expect(await consume(a)).toBe(1);
      expect(await consume(a)).toBe(2);
      expect(await consume(b)).toBe(1);
      expect(await consume(a)).toBe(3);
      const rows = await db.query(
        `select period = date_trunc('month', now() at time zone 'utc')::date as current
         from public.usage_counters where owner_id = $1`,
        [a],
      );
      expect(rows).toEqual([{ current: true }]);
    }));
});

describe('claim_quota_notice', () => {
  it('returns true once per month after usage exists', () =>
    withTx(async (db) => {
      const uid = await createUser(db);
      const claim = async () =>
        (await db.query<{ ok: boolean }>('select public.claim_quota_notice($1) as ok', [uid]))[0]
          ?.ok;
      expect(await claim()).toBe(false); // no counter row yet
      await db.query('select public.consume_quota($1)', [uid]);
      expect(await claim()).toBe(true);
      expect(await claim()).toBe(false);
    }));
});

describe('hit_rate_limit', () => {
  it('reports exceeded after max hits within the window', () =>
    withTx(async (db) => {
      const hit = async (key: string) =>
        (
          await db.query<{ limited: boolean }>(
            'select public.hit_rate_limit($1, 5, 60) as limited',
            [key],
          )
        )[0]?.limited;
      for (let i = 0; i < 5; i++) expect(await hit('submit:a')).toBe(false);
      expect(await hit('submit:a')).toBe(true);
      expect(await hit('submit:b')).toBe(false);
    }));
});
