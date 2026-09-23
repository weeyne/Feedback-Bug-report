import {
  createFeedback,
  createProject,
  createUser,
  withTx,
  type TestDb,
} from '@dymcode/db-tests/harness';
import { describe, expect, it } from 'vitest';
import { VALID_ENV } from '@/test/fixtures';
import type { AuthAdmin } from '../auth/admin';
import type { PaddleClient } from '../billing/paddle';
import { parseEnv } from '../env';
import { createMemoryStorage } from '../storage';
import { deleteAccount } from './account';

const dbAdmin = (db: TestDb): AuthAdmin => ({
  deleteUser: async (id) => {
    await db.query('delete from auth.users where id = $1', [id]);
  },
});

describe('deleteAccount', () => {
  it('requires the email, removes screenshots of every owned project and deletes the user', () =>
    withTx(async (db) => {
      const storage = createMemoryStorage();
      const deps = { db, storage, env: parseEnv(VALID_ENV), fetch, authAdmin: dbAdmin(db) };
      const email = 'owner@example.com';
      const owner = await createUser(db, email);
      const other = await createUser(db);
      const mine = await createProject(db, owner);
      const theirs = await createProject(db, other);
      const paths: string[] = [];
      for (const project of [mine, theirs]) {
        const id = await createFeedback(db, project.id, { overQuota: project === mine });
        const path = `${project.id}/${id}.webp`;
        paths.push(path);
        await storage.upload(path, new Uint8Array([1]), 'image/webp');
        await db.query('update public.feedback set screenshot_path = $1 where id = $2', [path, id]);
      }

      expect(await deleteAccount(deps, { id: owner, email }, 'wrong@example.com')).toEqual({
        ok: false,
        error: 'account.confirmMismatch',
      });
      expect(await deleteAccount(deps, { id: owner, email }, '  OWNER@example.com ')).toEqual({
        ok: true,
      });
      expect(await db.query('select 1 from auth.users where id = $1', [owner])).toEqual([]);
      expect(await db.query('select 1 from public.projects where id = $1', [mine.id])).toEqual([]);
      expect([...storage.files.keys()]).toEqual([paths[1]]);
    }));

  it('leaves the user and their screenshots untouched when authAdmin.deleteUser fails', () =>
    withTx(async (db) => {
      const storage = createMemoryStorage();
      const failingAdmin: AuthAdmin = {
        deleteUser: async () => {
          throw new Error('supabase admin api down');
        },
      };
      const deps = { db, storage, env: parseEnv(VALID_ENV), fetch, authAdmin: failingAdmin };
      const email = 'owner@example.com';
      const owner = await createUser(db, email);
      const project = await createProject(db, owner);
      const id = await createFeedback(db, project.id);
      const path = `${project.id}/${id}.webp`;
      await storage.upload(path, new Uint8Array([1]), 'image/webp');
      await db.query('update public.feedback set screenshot_path = $1 where id = $2', [path, id]);

      expect(await deleteAccount(deps, { id: owner, email }, email)).toEqual({
        ok: false,
        error: 'errors.generic',
      });
      expect((await db.query('select 1 from auth.users where id = $1', [owner])).length).toBe(1);
      expect([...storage.files.keys()]).toEqual([path]);
    }));

  it('cancels active subscriptions immediately before deleting the account', () =>
    withTx(async (db) => {
      const storage = createMemoryStorage();
      const email = 'sub@example.com';
      const owner = await createUser(db, email);
      await db.query(
        `insert into public.subscriptions (user_id, plan, status, paddle_subscription_id)
         values ($1, 'pro_monthly', 'active', 'sub_del'), ($1, 'pro_monthly', 'canceled', 'sub_old')`,
        [owner],
      );
      await db.query(
        `insert into public.subscriptions (user_id, plan, status, paddle_subscription_id, cancel_at_period_end)
         values ($1, 'pro_monthly', 'active', 'sub_sched', true)`,
        [owner],
      );
      const cancelled: string[] = [];
      const paddle: PaddleClient = {
        createTransaction: async () => ({ id: 'x' }),
        createPortalSession: async () => 'x',
        findCustomer: async () => 'cus_x',
        ensureCustomer: async () => 'cus_x',
        remainingTotal: async () => 0,
        cancelSubscription: async (id, when) => {
          cancelled.push(`${id}:${when}`);
        },
      };
      const deps = { db, storage, env: parseEnv(VALID_ENV), fetch, authAdmin: dbAdmin(db), paddle };
      expect(await deleteAccount(deps, { id: owner, email }, email)).toEqual({ ok: true });
      expect(cancelled).toEqual(['sub_del:immediately']);
    }));

  it('keeps the account when the subscription cannot be cancelled', () =>
    withTx(async (db) => {
      const email = 'keep@example.com';
      const owner = await createUser(db, email);
      await db.query(
        `insert into public.subscriptions (user_id, plan, status, paddle_subscription_id)
         values ($1, 'pro_monthly', 'active', 'sub_keep')`,
        [owner],
      );
      const paddle: PaddleClient = {
        createTransaction: async () => ({ id: 'x' }),
        createPortalSession: async () => 'x',
        findCustomer: async () => 'cus_x',
        ensureCustomer: async () => 'cus_x',
        remainingTotal: async () => 0,
        cancelSubscription: async () => {
          throw new Error('paddle down');
        },
      };
      const deps = {
        db,
        storage: createMemoryStorage(),
        env: parseEnv(VALID_ENV),
        fetch,
        authAdmin: dbAdmin(db),
        paddle,
      };
      expect(await deleteAccount(deps, { id: owner, email }, email)).toEqual({
        ok: false,
        error: 'errors.generic',
      });
      expect(await db.query('select 1 from auth.users where id = $1', [owner])).toHaveLength(1);
    }));

  it('keeps the account when billing is disabled but a subscription is still billing', () =>
    withTx(async (db) => {
      const email = 'nobilling@example.com';
      const owner = await createUser(db, email);
      await db.query(
        `insert into public.subscriptions (user_id, plan, status, paddle_subscription_id)
         values ($1, 'pro_monthly', 'past_due', 'sub_unbilled')`,
        [owner],
      );
      const deps = {
        db,
        storage: createMemoryStorage(),
        env: parseEnv(VALID_ENV),
        fetch,
        authAdmin: dbAdmin(db),
        paddle: null,
      };
      expect(await deleteAccount(deps, { id: owner, email }, email)).toEqual({
        ok: false,
        error: 'errors.generic',
      });
      expect(await db.query('select 1 from auth.users where id = $1', [owner])).toHaveLength(1);
    }));

  it('deletes without billing when no subscription would keep billing', () =>
    withTx(async (db) => {
      const email = 'ended@example.com';
      const owner = await createUser(db, email);
      await db.query(
        `insert into public.subscriptions
           (user_id, plan, status, paddle_subscription_id, paddle_transaction_id, cancel_at_period_end)
         values ($1, 'pro_monthly', 'active', 'sub_ending', null, true),
                ($1, 'pro_monthly', 'canceled', 'sub_done', null, false),
                ($1, 'pro_lifetime', 'paid', null, 'txn_life', false)`,
        [owner],
      );
      const deps = {
        db,
        storage: createMemoryStorage(),
        env: parseEnv(VALID_ENV),
        fetch,
        authAdmin: dbAdmin(db),
      };
      expect(await deleteAccount(deps, { id: owner, email }, email)).toEqual({ ok: true });
      expect(await db.query('select 1 from auth.users where id = $1', [owner])).toEqual([]);
    }));
});
