import { PUBLIC_KEY_PATTERN } from '@dymcode/shared/constants';
import { describe, expect, it } from 'vitest';
import { withTx } from './db';
import { createFeedback, createProject, createUser } from './fixtures';

describe('projects', () => {
  it('generates a public key in the shared format', () =>
    withTx(async (db) => {
      const owner = await createUser(db);
      const project = await createProject(db, owner);
      expect(project.public_key).toMatch(PUBLIC_KEY_PATTERN);
    }));

  it('applies widget defaults', () =>
    withTx(async (db) => {
      const owner = await createUser(db);
      const { id } = await createProject(db, owner);
      const rows = await db.query(
        `select primary_color, trigger_text, position, hide_badge, allowed_origins
         from public.projects where id = $1`,
        [id],
      );
      expect(rows).toEqual([
        {
          primary_color: '#6366f1',
          trigger_text: 'Feedback',
          position: 'bottom-right',
          hide_badge: false,
          allowed_origins: [],
        },
      ]);
    }));

  it('rejects an invalid primary color', () =>
    withTx(async (db) => {
      const owner = await createUser(db);
      const error = await db.queryError(
        `insert into public.projects (owner_id, name, primary_color) values ($1, 'x', 'blue')`,
        [owner],
      );
      expect(error).toMatch(/projects_primary_color_check/);
    }));

  it('rejects custom css over 10240 bytes', () =>
    withTx(async (db) => {
      const owner = await createUser(db);
      const error = await db.queryError(
        `insert into public.projects (owner_id, name, custom_css) values ($1, 'x', repeat('a', 10241))`,
        [owner],
      );
      expect(error).toMatch(/projects_custom_css_check/);
    }));

  it('cascades deletes to feedback and integrations', () =>
    withTx(async (db) => {
      const owner = await createUser(db);
      const { id } = await createProject(db, owner);
      await createFeedback(db, id);
      await db.query(
        `insert into public.integrations (project_id, kind, target) values ($1, 'telegram_shared', '42')`,
        [id],
      );
      await db.query('delete from public.projects where id = $1', [id]);
      const [counts] = await db.query(
        `select (select count(*)::int from public.feedback where project_id = $1) as feedback,
                (select count(*)::int from public.integrations where project_id = $1) as integrations`,
        [id],
      );
      expect(counts).toEqual({ feedback: 0, integrations: 0 });
    }));

  it('nulls referral attribution when the referring project is deleted', () =>
    withTx(async (db) => {
      const owner = await createUser(db);
      const referred = await createUser(db);
      const { id } = await createProject(db, owner);
      await db.query('update public.profiles set referred_by_project = $1 where id = $2', [
        id,
        referred,
      ]);
      await db.query('delete from public.projects where id = $1', [id]);
      const rows = await db.query('select referred_by_project from public.profiles where id = $1', [
        referred,
      ]);
      expect(rows).toEqual([{ referred_by_project: null }]);
    }));
});

describe('feedback', () => {
  it('rejects an empty message', () =>
    withTx(async (db) => {
      const owner = await createUser(db);
      const { id } = await createProject(db, owner);
      const error = await db.queryError(
        `insert into public.feedback (project_id, type, message) values ($1, 'bug', '')`,
        [id],
      );
      expect(error).toMatch(/feedback_message_check/);
    }));

  it('defaults to status new and not over quota', () =>
    withTx(async (db) => {
      const owner = await createUser(db);
      const { id } = await createProject(db, owner);
      const feedbackId = await createFeedback(db, id);
      const rows = await db.query(
        'select status, over_quota, metadata from public.feedback where id = $1',
        [feedbackId],
      );
      expect(rows).toEqual([{ status: 'new', over_quota: false, metadata: {} }]);
    }));
});

describe('integrations', () => {
  it('allows one integration per kind per project', () =>
    withTx(async (db) => {
      const owner = await createUser(db);
      const { id } = await createProject(db, owner);
      const insert = `insert into public.integrations (project_id, kind) values ($1, 'discord')`;
      await db.query(insert, [id]);
      expect(await db.queryError(insert, [id])).toMatch(/duplicate key/);
    }));
});

describe('telegram_link_codes', () => {
  it('generates a 12-char code expiring in 15 minutes', () =>
    withTx(async (db) => {
      const owner = await createUser(db);
      const { id } = await createProject(db, owner);
      const [row] = await db.query<{ code: string; ttl_minutes: number }>(
        `insert into public.telegram_link_codes (project_id) values ($1)
         returning code, round(extract(epoch from expires_at - now()) / 60)::int as ttl_minutes`,
        [id],
      );
      expect(row?.code).toMatch(/^[0-9A-Za-z]{12}$/);
      expect(row?.ttl_minutes).toBe(15);
    }));
});

describe('row level security', () => {
  it('is enabled on every public table', () =>
    withTx(async (db) => {
      const rows = await db.query(
        `select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
      );
      expect(rows).toEqual([]);
    }));
});
