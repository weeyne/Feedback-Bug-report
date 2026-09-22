import {
  createFeedback,
  createProject,
  createUser,
  grantPro,
  withTx,
  type TestDb,
} from '@dymcode/db-tests/harness';
import { describe, expect, it } from 'vitest';
import { VALID_ENV } from '@/test/fixtures';
import { parseEnv } from '../env';
import { createMemoryStorage, type MemoryStorage } from '../storage';
import {
  decodeCursor,
  deleteFeedback,
  encodeCursor,
  getFeedback,
  hiddenFeedbackCount,
  listFeedback,
  screenshotUrl,
  setFeedbackStatus,
  usage,
} from './feedback';
import type { DashDeps } from './result';

function setup(db: TestDb) {
  const storage: MemoryStorage = createMemoryStorage();
  const deps: DashDeps = { db, storage, env: parseEnv(VALID_ENV), fetch };
  return { deps, storage };
}

async function seed(db: TestDb, count: number) {
  const owner = await createUser(db);
  const project = await createProject(db, owner);
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const id = await createFeedback(db, project.id, { message: `m${i}` });
    await db.query(
      `update public.feedback set created_at = now() - ($2 || ' minutes')::interval where id = $1`,
      [id, String(count - i)],
    );
    ids.push(id);
  }
  return { owner, project, ids };
}

describe('feedback use cases', () => {
  it('lists newest first with cursor pagination and filters', () =>
    withTx(async (db) => {
      const { deps } = setup(db);
      const { owner, project, ids } = await seed(db, 55);
      const first = await listFeedback(deps, owner, { projectId: project.id });
      expect(first.items).toHaveLength(50);
      expect(first.items[0]!.id).toBe(ids[54]);
      expect(first.nextCursor).not.toBeNull();
      const second = await listFeedback(deps, owner, {
        projectId: project.id,
        cursor: first.nextCursor!,
      });
      expect(second.items.map((i) => i.id)).toEqual(ids.slice(0, 5).reverse());
      expect(second.nextCursor).toBeNull();
      await db.query(`update public.feedback set type = 'idea' where id = $1`, [ids[3]]);
      const ideas = await listFeedback(deps, owner, { projectId: project.id, type: 'idea' });
      expect(ideas.items.map((i) => i.id)).toEqual([ids[3]]);
      const resolved = await listFeedback(deps, owner, {
        projectId: project.id,
        status: 'resolved',
      });
      expect(resolved.items).toEqual([]);
    }));

  it('round-trips cursors and rejects garbage', () => {
    const cursor = {
      createdAt: '2026-09-22T10:00:00.000Z',
      id: '8c0e2f36-3c5e-4f63-9d5b-0a4d1b1f6a10',
    };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
    expect(decodeCursor('garbage')).toBeUndefined();
    expect(decodeCursor(undefined)).toBeUndefined();
  });

  it('never exposes other users’ feedback', () =>
    withTx(async (db) => {
      const { deps } = setup(db);
      const { project, ids } = await seed(db, 1);
      const stranger = await createUser(db);
      expect((await listFeedback(deps, stranger, { projectId: project.id })).items).toEqual([]);
      expect(await getFeedback(deps, stranger, ids[0]!)).toBeNull();
      expect(
        await setFeedbackStatus(deps, stranger, { feedbackId: ids[0]!, status: 'resolved' }),
      ).toEqual({
        ok: false,
        error: 'errors.notFound',
      });
      expect(await deleteFeedback(deps, stranger, ids[0]!)).toEqual({
        ok: false,
        error: 'errors.notFound',
      });
    }));

  it('hides over-quota feedback from Free owners but counts it', () =>
    withTx(async (db) => {
      const { deps } = setup(db);
      const owner = await createUser(db);
      const project = await createProject(db, owner);
      await createFeedback(db, project.id, { message: 'visible' });
      await createFeedback(db, project.id, { message: 'hidden', overQuota: true });
      expect(
        (await listFeedback(deps, owner, { projectId: project.id })).items.map((i) => i.message),
      ).toEqual(['visible']);
      expect(await hiddenFeedbackCount(deps, owner, project.id)).toBe(1);
      await grantPro(db, owner);
      expect(await hiddenFeedbackCount(deps, owner, project.id)).toBe(0);
      const stranger = await createUser(db);
      expect(await hiddenFeedbackCount(deps, stranger, project.id)).toBe(0);
    }));

  it('updates status and deletes feedback with its screenshot', () =>
    withTx(async (db) => {
      const { deps, storage } = setup(db);
      const { owner, project, ids } = await seed(db, 1);
      const path = `${project.id}/${ids[0]}.webp`;
      await storage.upload(path, new Uint8Array([1]), 'image/webp');
      await db.query('update public.feedback set screenshot_path = $1 where id = $2', [
        path,
        ids[0],
      ]);
      expect(await screenshotUrl(deps, owner, ids[0]!)).toMatch(/^data:image\/webp;base64,/);
      expect(
        await setFeedbackStatus(deps, owner, { feedbackId: ids[0]!, status: 'resolved' }),
      ).toEqual({ ok: true });
      expect((await getFeedback(deps, owner, ids[0]!))?.status).toBe('resolved');
      expect(await deleteFeedback(deps, owner, ids[0]!)).toEqual({ ok: true });
      expect(await getFeedback(deps, owner, ids[0]!)).toBeNull();
      expect(storage.files.has(path)).toBe(false);
    }));

  it('reports monthly usage and plan', () =>
    withTx(async (db) => {
      const { deps } = setup(db);
      const owner = await createUser(db);
      expect(await usage(deps, owner)).toEqual({ used: 0, limit: 20, pro: false });
      await db.query(
        `insert into public.usage_counters (owner_id, period, count)
         values ($1, date_trunc('month', now() at time zone 'utc')::date, 7)`,
        [owner],
      );
      expect(await usage(deps, owner)).toEqual({ used: 7, limit: 20, pro: false });
      await grantPro(db, owner);
      expect(await usage(deps, owner)).toEqual({ used: 7, limit: null, pro: true });
    }));
});
