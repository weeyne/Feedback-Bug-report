import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { runRetention } from '../retention';
import { createMemoryStorage } from '../storage';
import { handleSubmit } from '../widget/submit';
import { closePostgresDb, createPostgresDb } from './postgres';
import type { Db } from './types';

/**
 * Exercises the production adapter (postgres.js) against real Postgres. Runs only in CI
 * (`DB_TEST_TARGET=supabase`): no harness transaction, so it uses unique data and cleans up.
 */
describe.runIf(process.env.DB_TEST_TARGET === 'supabase')(
  'createPostgresDb (real Postgres)',
  () => {
    let db: Db;
    const ownerId = randomUUID();
    let project: { id: string; public_key: string };

    beforeAll(async () => {
      db = createPostgresDb(
        process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
      );
      await db.query(
        `insert into auth.users (id, instance_id, aud, role, email)
       values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2)`,
        [ownerId, `${ownerId}@test.dev`],
      );
      [project] = (await db.query<{ id: string; public_key: string }>(
        `insert into public.projects (owner_id, name) values ($1, 'postgres.js adapter')
       returning id, public_key`,
        [ownerId],
      )) as [{ id: string; public_key: string }];
    });

    afterAll(async () => {
      if (!db) return;
      try {
        if (project) {
          await db.query('delete from public.rate_limits where key like $1', [
            `%${project.public_key}%`,
          ]);
        }
        // Cascades to profile, projects, feedback and usage counters.
        await db.query('delete from auth.users where id = $1', [ownerId]);
      } finally {
        await closePostgresDb(db);
      }
    });

    it('stores submitted metadata as a jsonb object', async () => {
      const url = 'https://host.example/postgres-js';
      const form = new FormData();
      form.append(
        'payload',
        JSON.stringify({
          projectKey: project.public_key,
          type: 'bug',
          message: 'postgres.js adapter check',
          email: '',
          metadata: {
            url,
            referrer: '',
            userAgent: 'Mozilla/5.0',
            language: 'en-US',
            timezone: 'UTC',
            viewport: { w: 1280, h: 720 },
            screen: { w: 1920, h: 1080, dpr: 1 },
            consoleErrors: [],
          },
          elapsedMs: 5000,
          website: '',
        }),
      );
      const notify = { feedback: vi.fn(async () => {}), quotaNotice: vi.fn(async () => {}) };
      const res = await handleSubmit(
        {
          db,
          storage: createMemoryStorage(),
          env: { IP_HASH_SALT: 'integration-salt-0123456789' },
          after: () => {},
          notify,
        },
        new Request('https://bugping.app/api/v1/widget/submit', {
          method: 'POST',
          body: form,
          headers: { 'x-forwarded-for': `203.0.113.${Math.floor(Math.random() * 200)}` },
        }),
      );
      expect(res.status).toBe(201);
      const { id } = (await res.json()) as { id: string };
      const [row] = await db.query<{ kind: string; url: string }>(
        `select jsonb_typeof(metadata) as kind, metadata->>'url' as url
       from public.feedback where id = $1`,
        [id],
      );
      expect(row).toEqual({ kind: 'object', url });
    });

    it('passes uuid[] and text[] parameters through retention', async () => {
      const [old] = await db.query<{ id: string }>(
        `insert into public.feedback (project_id, type, message, created_at)
       values ($1, 'bug', 'old', now() - interval '40 days') returning id`,
        [project.id],
      );
      const path = `${project.id}/${old!.id}.webp`;
      await db.query('update public.feedback set screenshot_path = $1 where id = $2', [
        path,
        old!.id,
      ]);
      const storage = createMemoryStorage();
      await storage.upload(path, new Uint8Array([1]), 'image/webp');

      const result = await runRetention({ db, storage, env: { CRON_SECRET: 'x'.repeat(16) } });

      expect(result.removed).toBeGreaterThanOrEqual(1);
      expect(storage.files.has(path)).toBe(false);
      const [row] = await db.query<{ p: string | null }>(
        'select screenshot_path as p from public.feedback where id = $1',
        [old!.id],
      );
      expect(row!.p).toBeNull();
    });

    it('returns an integer from consume_quota', async () => {
      const [row] = await db.query<{ count: unknown }>('select public.consume_quota($1) as count', [
        ownerId,
      ]);
      expect(Number.isInteger(row!.count)).toBe(true);
    });
  },
);
