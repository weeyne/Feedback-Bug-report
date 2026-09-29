import {
  createProject,
  createUser,
  grantPro,
  withTx,
  type TestDb,
} from '@bugping/db-tests/harness';
import { describe, expect, it } from 'vitest';
import { createMemoryStorage } from './storage';
import { handleRetention, runRetention, type RetentionDeps } from './retention';

async function screenshotFeedback(
  db: TestDb,
  projectId: string,
  ageDays: number,
  storage: ReturnType<typeof createMemoryStorage>,
) {
  const [row] = await db.query<{ id: string }>(
    `insert into public.feedback (project_id, type, message, created_at)
     values ($1, 'bug', 'x', now() - ($2 || ' days')::interval) returning id`,
    [projectId, String(ageDays)],
  );
  const path = `${projectId}/${row!.id}.webp`;
  await db.query('update public.feedback set screenshot_path = $1 where id = $2', [path, row!.id]);
  await storage.upload(path, new Uint8Array([1]), 'image/webp');
  return { id: row!.id, path };
}

async function project(db: TestDb, pro: boolean) {
  const owner = await createUser(db);
  if (pro) await grantPro(db, owner);
  return createProject(db, owner);
}

const pathOf = (db: TestDb, id: string) =>
  db
    .query<{ p: string | null }>('select screenshot_path as p from public.feedback where id = $1', [
      id,
    ])
    .then((r) => r[0]!.p);

describe('runRetention', () => {
  it('removes screenshots past the tier retention and keeps the rest', () =>
    withTx(async (db) => {
      const storage = createMemoryStorage();
      const free = await project(db, false);
      const pro = await project(db, true);
      const freeOld = await screenshotFeedback(db, free.id, 31, storage);
      const freeNew = await screenshotFeedback(db, free.id, 29, storage);
      const proMid = await screenshotFeedback(db, pro.id, 200, storage);
      const proOld = await screenshotFeedback(db, pro.id, 400, storage);
      const result = await runRetention({ db, storage, env: { CRON_SECRET: 'x'.repeat(16) } });
      expect(result).toEqual({ removed: 2, remaining: 0 });
      expect(await pathOf(db, freeOld.id)).toBeNull();
      expect(await pathOf(db, proOld.id)).toBeNull();
      expect(await pathOf(db, freeNew.id)).toBe(freeNew.path);
      expect(await pathOf(db, proMid.id)).toBe(proMid.path);
      expect([...storage.files.keys()].sort()).toEqual([freeNew.path, proMid.path].sort());
    }));

  it('keeps paths whose files Storage failed to remove, and works in batches', () =>
    withTx(async (db) => {
      const storage = createMemoryStorage();
      const free = await project(db, false);
      const items = [];
      for (let i = 0; i < 5; i++)
        items.push(await screenshotFeedback(db, free.id, 40 + i, storage));
      storage.failRemovals.add(items[0]!.path);
      const result = await runRetention({
        db,
        storage,
        env: { CRON_SECRET: 'x'.repeat(16) },
        batchSize: 2,
      });
      expect(result).toEqual({ removed: 4, remaining: 1 });
      expect(await pathOf(db, items[0]!.id)).toBe(items[0]!.path);
    }));
});

describe('handleRetention', () => {
  it('requires the cron secret', () =>
    withTx(async (db) => {
      const deps: RetentionDeps = {
        db,
        storage: createMemoryStorage(),
        env: { CRON_SECRET: 's'.repeat(20) },
      };
      const denied = await handleRetention(
        deps,
        new Request('https://bugping.app/api/cron/retention'),
      );
      expect(denied.status).toBe(401);
      const ok = await handleRetention(
        deps,
        new Request('https://bugping.app/api/cron/retention', {
          headers: { authorization: `Bearer ${'s'.repeat(20)}` },
        }),
      );
      expect(ok.status).toBe(200);
      expect(await ok.json()).toEqual({ removed: 0, remaining: 0 });
    }));
});
