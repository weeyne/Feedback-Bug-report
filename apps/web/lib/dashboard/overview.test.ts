import {
  createFeedback,
  createProject,
  createUser,
  grantPro,
  withTx,
  type TestDb,
} from '@bugping/db-tests/harness';
import { describe, expect, it } from 'vitest';
import { VALID_ENV } from '@/test/fixtures';
import { parseEnv } from '../env';
import { createMemoryStorage } from '../storage';
import { getOverview } from './overview';
import type { DashDeps } from './result';

const deps = (db: TestDb): DashDeps => ({
  db,
  storage: createMemoryStorage(),
  env: parseEnv(VALID_ENV),
  fetch,
});

async function at(db: TestDb, id: string, daysAgo: number, type = 'bug', status = 'new') {
  await db.query(
    `update public.feedback set created_at = now() - ($2 || ' days')::interval, type = $3::feedback_type, status = $4::feedback_status where id = $1`,
    [id, String(daysAgo), type, status],
  );
}

describe('getOverview', () => {
  it('returns null for a project the user does not own', () =>
    withTx(async (db) => {
      const owner = await createUser(db);
      const other = await createUser(db);
      const project = await createProject(db, owner);
      expect(await getOverview(deps(db), other, project.id)).toBeNull();
    }));

  it('counts, zero-filled 30-day series by type and checklist', () =>
    withTx(async (db) => {
      const owner = await createUser(db);
      const project = await createProject(db, owner);
      const a = await createFeedback(db, project.id);
      const b = await createFeedback(db, project.id);
      const c = await createFeedback(db, project.id);
      const old = await createFeedback(db, project.id);
      await at(db, a, 0, 'bug', 'new');
      await at(db, b, 0, 'idea', 'resolved');
      await at(db, c, 3, 'general', 'new');
      await at(db, old, 40, 'bug', 'resolved');
      await db.query(
        `update public.feedback set created_at = created_at + interval '1 minute' where id = $1`,
        [a],
      );
      const o = (await getOverview(deps(db), owner, project.id))!;
      expect(o.counts).toEqual({ new: 2, resolved: 2, last30: 3 });
      expect(o.series).toHaveLength(30);
      expect(o.series.at(-1)).toMatchObject({ bug: 1, idea: 1, general: 0 });
      expect(o.series.at(-4)).toMatchObject({ bug: 0, idea: 0, general: 1 });
      expect(o.series.reduce((n, d) => n + d.bug + d.idea + d.general, 0)).toBe(3);
      expect(o.checklist).toEqual({ widgetSeen: false, notifications: false, firstFeedback: true });
      expect(o.recent.map((r) => r.id)).toEqual([a, b, c, old]);
    }));

  it('bounds the series window at UTC midnight 29 days ago', () =>
    withTx(async (db) => {
      const owner = await createUser(db);
      const project = await createProject(db, owner);
      const first = await createFeedback(db, project.id);
      const before = await createFeedback(db, project.id);
      const ancient = await createFeedback(db, project.id);
      const start = `((now() at time zone 'utc')::date - 29)::timestamp at time zone 'utc'`;
      await db.query(`update public.feedback set created_at = ${start} where id = $1`, [first]);
      await db.query(
        `update public.feedback set created_at = ${start} - interval '1 microsecond' where id = $1`,
        [before],
      );
      await db.query(
        `update public.feedback set created_at = now() - interval '400 days' where id = $1`,
        [ancient],
      );
      const o = (await getOverview(deps(db), owner, project.id))!;
      expect(o.series).toHaveLength(30);
      expect(o.series[0]).toMatchObject({ bug: 1, idea: 0, general: 0 });
      expect(o.series.reduce((n, d) => n + d.bug + d.idea + d.general, 0)).toBe(1);
    }));

  it('masks over-quota feedback for free owners but counts it', () =>
    withTx(async (db) => {
      const owner = await createUser(db);
      const project = await createProject(db, owner);
      await createFeedback(db, project.id, { message: 'secret', overQuota: true });
      const o = (await getOverview(deps(db), owner, project.id))!;
      expect(o.counts.new).toBe(1);
      expect(o.recent[0]).toEqual({
        id: expect.any(String),
        type: null,
        status: 'new',
        message: '',
        created_at: expect.any(String),
        hidden: true,
      });
      await grantPro(db, owner);
      const pro = (await getOverview(deps(db), owner, project.id))!;
      expect(pro.recent[0]).toMatchObject({ hidden: false, message: 'secret', type: 'bug' });
    }));

  it('reports widget seen and connected integrations', () =>
    withTx(async (db) => {
      const owner = await createUser(db);
      const project = await createProject(db, owner);
      await db.query('update public.projects set widget_seen_at = now() where id = $1', [
        project.id,
      ]);
      await db.query(
        `insert into public.integrations (project_id, kind, target, enabled) values ($1, 'telegram_shared', '1', true), ($1, 'discord', null, false)`,
        [project.id],
      );
      const o = (await getOverview(deps(db), owner, project.id))!;
      expect(o.checklist).toMatchObject({ widgetSeen: true, notifications: true });
      expect(o.integrations).toEqual({ telegram: true, discord: false });
      expect(o.widgetSeenAt).not.toBeNull();
    }));
});
