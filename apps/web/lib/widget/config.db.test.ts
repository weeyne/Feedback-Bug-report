import {
  createProject,
  createUser,
  grantPro,
  withTx,
  type TestDb,
} from '@bugping/db-tests/harness';
import { WidgetConfigSchema } from '@bugping/shared';
import { describe, expect, it } from 'vitest';
import { handleConfig, markWidgetSeen } from './config';
import { markOriginBlocked } from './project';

const get = (db: TestDb, key: string) =>
  handleConfig(
    { db, env: { NEXT_PUBLIC_APP_URL: 'https://app.example' } },
    new Request(`https://bugping.app/api/v1/widget/config?key=${key}`, {
      headers: { origin: 'https://host.example' },
    }),
  );

async function projectWithSettings(db: TestDb, pro: boolean) {
  const owner = await createUser(db);
  if (pro) await grantPro(db, owner);
  const project = await createProject(db, owner, 'Acme');
  await db.query(
    `update public.projects set hide_badge = true, custom_css = '.bp-trigger{border-radius:0}',
       locale = 'uk', primary_color = '#ff0066', trigger_text = 'Help' where id = $1`,
    [project.id],
  );
  return project;
}

describe('handleConfig', () => {
  it('returns 404 for malformed and unknown keys', () =>
    withTx(async (db) => {
      expect((await get(db, 'nope')).status).toBe(404);
      expect((await get(db, 'pk_AbCdEfGh12345678')).status).toBe(404);
    }));

  it('ignores Pro-only settings for Free owners', () =>
    withTx(async (db) => {
      const project = await projectWithSettings(db, false);
      const res = await get(db, project.public_key);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(WidgetConfigSchema.safeParse(body).success).toBe(true);
      expect(body).toEqual({
        primaryColor: '#ff0066',
        triggerText: 'Help',
        position: 'bottom-right',
        showBadge: true,
        customCss: null,
        badgeUrl: `https://app.example/?ref=${project.public_key}&utm_source=widget`,
        locale: 'uk',
      });
    }));

  it('applies Pro-only settings for Pro owners', () =>
    withTx(async (db) => {
      const project = await projectWithSettings(db, true);
      const body = await (await get(db, project.public_key)).json();
      expect(body.showBadge).toBe(false);
      expect(body.customCss).toBe('.bp-trigger{border-radius:0}');
    }));

  it('sends cache and CORS headers', () =>
    withTx(async (db) => {
      const project = await projectWithSettings(db, false);
      const res = await get(db, project.public_key);
      expect(res.headers.get('cache-control')).toBe(
        'public, s-maxage=60, stale-while-revalidate=300',
      );
      expect(res.headers.get('access-control-allow-origin')).toBe('https://host.example');
    }));

  describe('widget seen ping', () => {
    it('marks the project as seen on a successful config request', () =>
      withTx(async (db) => {
        const project = await projectWithSettings(db, false);
        const tasks: Array<Promise<void>> = [];
        await handleConfig(
          {
            db,
            env: { NEXT_PUBLIC_APP_URL: 'https://app.example' },
            after: (t) => void tasks.push(t()),
          },
          new Request(`https://bugping.app/api/v1/widget/config?key=${project.public_key}`, {
            headers: { origin: 'https://host.example' },
          }),
        );
        await Promise.all(tasks);
        const [row] = await db.query<{ seen: boolean }>(
          'select widget_seen_at is not null as seen from public.projects where id = $1',
          [project.id],
        );
        expect(row!.seen).toBe(true);
      }));

    it('serves a request without Origin but does not mark the project as seen', () =>
      withTx(async (db) => {
        const project = await projectWithSettings(db, false);
        const tasks: Array<Promise<void>> = [];
        const res = await handleConfig(
          {
            db,
            env: { NEXT_PUBLIC_APP_URL: 'https://app.example' },
            after: (t) => void tasks.push(t()),
          },
          new Request(`https://bugping.app/api/v1/widget/config?key=${project.public_key}`),
        );
        expect(res.status).toBe(200);
        expect(tasks).toHaveLength(0);
        const [row] = await db.query<{ seen: boolean }>(
          'select widget_seen_at is not null as seen from public.projects where id = $1',
          [project.id],
        );
        expect(row!.seen).toBe(false);
      }));

    it('rewrites at most once per hour', () =>
      withTx(async (db) => {
        const project = await projectWithSettings(db, false);
        await db.query(
          `update public.projects set widget_seen_at = now() - interval '10 minutes' where id = $1`,
          [project.id],
        );
        await markWidgetSeen(db, project.id);
        const [recent] = await db.query<{ age: number }>(
          `select extract(epoch from now() - widget_seen_at)::int as age from public.projects where id = $1`,
          [project.id],
        );
        expect(recent!.age).toBeGreaterThanOrEqual(590);
        await db.query(
          `update public.projects set widget_seen_at = now() - interval '2 hours' where id = $1`,
          [project.id],
        );
        await markWidgetSeen(db, project.id);
        const [fresh] = await db.query<{ age: number }>(
          `select extract(epoch from now() - widget_seen_at)::int as age from public.projects where id = $1`,
          [project.id],
        );
        expect(fresh!.age).toBeLessThan(5);
      }));

    it('never fails the config response when the ping fails', async () => {
      const failingAfter = (task: () => Promise<void>) => void task().catch(() => {});
      // db whose update throws but whose project lookup works: wrap a real TestDb
      await withTx(async (db) => {
        const project = await projectWithSettings(db, false);
        const flaky = {
          ...db,
          query: async (sql: string, params?: unknown[]) => {
            if (/widget_seen_at/.test(sql)) throw new Error('db down');
            return db.query(sql, params as never);
          },
        } as typeof db;
        const res = await handleConfig(
          { db: flaky, env: { NEXT_PUBLIC_APP_URL: 'https://app.example' }, after: failingAfter },
          new Request(`https://bugping.app/api/v1/widget/config?key=${project.public_key}`, {
            headers: { origin: 'https://host.example' },
          }),
        );
        expect(res.status).toBe(200);
      });
    });
  });

  describe('allowed origins', () => {
    async function locked(db: TestDb) {
      const project = await projectWithSettings(db, false);
      await db.query(
        `update public.projects set allowed_origins = '{https://shop.example}' where id = $1`,
        [project.id],
      );
      return project;
    }
    const call = (db: TestDb, key: string, origin: string | null) => {
      const tasks: Array<Promise<void>> = [];
      const res = handleConfig(
        {
          db,
          env: { NEXT_PUBLIC_APP_URL: 'https://app.example' },
          after: (t) => void tasks.push(t()),
        },
        new Request(`https://bugping.app/api/v1/widget/config?key=${key}`, {
          headers: origin ? { origin } : {},
        }),
      );
      return { res, settled: async () => Promise.all(tasks) };
    };
    const state = async (db: TestDb, id: string) =>
      (
        await db.query<{ blocked_origin: string | null; seen: boolean }>(
          `select blocked_origin, widget_seen_at is not null as seen from public.projects where id = $1`,
          [id],
        )
      )[0];

    it('refuses a disallowed Origin, records it and does not mark the widget seen', () =>
      withTx(async (db) => {
        const project = await locked(db);
        const { res, settled } = call(db, project.public_key, 'https://evil.example');
        const response = await res;
        expect(response.status).toBe(403);
        expect(response.headers.get('cache-control')).toBeNull();
        await settled();
        expect(await state(db, project.id)).toEqual({
          blocked_origin: 'https://evil.example',
          seen: false,
        });
      }));

    it('serves the www variant of an allowed site and marks it seen', () =>
      withTx(async (db) => {
        const project = await locked(db);
        const { res, settled } = call(db, project.public_key, 'https://www.shop.example');
        expect((await res).status).toBe(200);
        await settled();
        expect(await state(db, project.id)).toEqual({ blocked_origin: null, seen: true });
      }));

    it('serves a request without Origin even when a list is set', () =>
      withTx(async (db) => {
        const project = await locked(db);
        const { res } = call(db, project.public_key, null);
        expect((await res).status).toBe(200);
      }));
  });

  it('rewrites the blocked origin at most once per hour for the same origin', () =>
    withTx(async (db) => {
      const project = await projectWithSettings(db, false);
      await db.query(
        `update public.projects set blocked_origin = 'https://a.example',
           blocked_origin_at = now() - interval '10 minutes' where id = $1`,
        [project.id],
      );
      const age = async () =>
        (
          await db.query<{ age: number; origin: string }>(
            `select extract(epoch from now() - blocked_origin_at)::int as age, blocked_origin as origin
             from public.projects where id = $1`,
            [project.id],
          )
        )[0]!;
      await markOriginBlocked(db, project.id, 'https://a.example');
      expect((await age()).age).toBeGreaterThanOrEqual(590);
      await markOriginBlocked(db, project.id, 'https://b.example');
      expect(await age()).toEqual({ age: expect.any(Number), origin: 'https://b.example' });
      expect((await age()).age).toBeLessThan(5);
    }));

  it('does not write a different origin within the per-project floor of one minute', () =>
    withTx(async (db) => {
      const project = await projectWithSettings(db, false);
      await db.query(
        `update public.projects set blocked_origin = 'https://a.example', blocked_origin_at = now()
         where id = $1`,
        [project.id],
      );
      await markOriginBlocked(db, project.id, 'https://b.example');
      const [row] = await db.query<{ origin: string | null }>(
        `select blocked_origin as origin from public.projects where id = $1`,
        [project.id],
      );
      expect(row!.origin).toBe('https://a.example');
    }));

  it('writes a different origin once the one-minute floor has passed', () =>
    withTx(async (db) => {
      const project = await projectWithSettings(db, false);
      await db.query(
        `update public.projects set blocked_origin = 'https://a.example',
           blocked_origin_at = now() - interval '2 minutes' where id = $1`,
        [project.id],
      );
      await markOriginBlocked(db, project.id, 'https://b.example');
      const [row] = await db.query<{ origin: string | null }>(
        `select blocked_origin as origin from public.projects where id = $1`,
        [project.id],
      );
      expect(row!.origin).toBe('https://b.example');
    }));

  it('skips an over-long origin without throwing', () =>
    withTx(async (db) => {
      const project = await projectWithSettings(db, false);
      await expect(
        markOriginBlocked(db, project.id, 'https://example.com/' + 'a'.repeat(2048)),
      ).resolves.toBeUndefined();
      const [row] = await db.query<{ origin: string | null }>(
        `select blocked_origin as origin from public.projects where id = $1`,
        [project.id],
      );
      expect(row!.origin).toBeNull();
    }));
});
