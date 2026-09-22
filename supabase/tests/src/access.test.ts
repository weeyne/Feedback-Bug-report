import { describe, expect, it } from 'vitest';
import { type Db, withTx } from './db';
import { createFeedback, createProject, createUser, grantPro } from './fixtures';

/** Two tenants: A (free) with one visible and one over-quota feedback, B with one feedback. */
async function seed(db: Db) {
  const a = await createUser(db);
  const b = await createUser(db);
  const projectA = await createProject(db, a, 'A');
  const projectB = await createProject(db, b, 'B');
  const visible = await createFeedback(db, projectA.id, { message: 'visible' });
  const hidden = await createFeedback(db, projectA.id, { message: 'hidden', overQuota: true });
  const foreign = await createFeedback(db, projectB.id, { message: 'foreign' });
  return { a, b, projectA, projectB, visible, hidden, foreign };
}

describe('projects access', () => {
  it('shows users only their own projects', () =>
    withTx(async (db) => {
      const { a, projectA } = await seed(db);
      await db.asUser(a);
      expect(await db.query('select id from public.projects')).toEqual([{ id: projectA.id }]);
    }));

  it('forbids creating projects from the client', () =>
    withTx(async (db) => {
      const { a } = await seed(db);
      await db.asUser(a);
      const error = await db.queryError(
        `insert into public.projects (owner_id, name) values ($1, 'sneaky')`,
        [a],
      );
      expect(error).toMatch(/permission denied/);
    }));

  it('allows updating settings columns on own project only', () =>
    withTx(async (db) => {
      const { a, projectA, projectB } = await seed(db);
      await db.asUser(a);
      const own = await db.query(
        `update public.projects set primary_color = '#000000' where id = $1 returning id`,
        [projectA.id],
      );
      expect(own).toHaveLength(1);
      const foreign = await db.query(
        `update public.projects set primary_color = '#000000' where id = $1 returning id`,
        [projectB.id],
      );
      expect(foreign).toHaveLength(0);
    }));

  it('forbids changing owner_id or public_key', () =>
    withTx(async (db) => {
      const { a, b, projectA } = await seed(db);
      await db.asUser(a);
      expect(
        await db.queryError('update public.projects set owner_id = $1 where id = $2', [
          b,
          projectA.id,
        ]),
      ).toMatch(/permission denied/);
      expect(
        await db.queryError(`update public.projects set public_key = 'pk_x' where id = $1`, [
          projectA.id,
        ]),
      ).toMatch(/permission denied/);
    }));

  it('hides projects from anon', () =>
    withTx(async (db) => {
      await seed(db);
      await db.asAnon();
      expect(await db.queryError('select id from public.projects')).toMatch(/permission denied/);
    }));

  it('allows the owner to update locale', () =>
    withTx(async (db) => {
      const { a, projectA } = await seed(db);
      await db.asUser(a);
      const rows = await db.query(
        `update public.projects set locale = 'uk' where id = $1 returning locale`,
        [projectA.id],
      );
      expect(rows).toEqual([{ locale: 'uk' }]);
    }));
});

describe('feedback access', () => {
  it('hides over-quota feedback from free users', () =>
    withTx(async (db) => {
      const { a, visible } = await seed(db);
      await db.asUser(a);
      expect(await db.query('select id from public.feedback')).toEqual([{ id: visible }]);
    }));

  it('shows over-quota feedback to pro users', () =>
    withTx(async (db) => {
      const { a, visible, hidden } = await seed(db);
      await grantPro(db, a);
      await db.asUser(a);
      const rows = await db.query<{ id: string }>(
        'select id from public.feedback order by message desc',
      );
      expect(rows.map((r) => r.id)).toEqual([visible, hidden]);
    }));

  it('allows updating status only', () =>
    withTx(async (db) => {
      const { a, visible } = await seed(db);
      await db.asUser(a);
      const updated = await db.query(
        `update public.feedback set status = 'resolved' where id = $1 returning status`,
        [visible],
      );
      expect(updated).toEqual([{ status: 'resolved' }]);
      expect(
        await db.queryError(`update public.feedback set over_quota = false where id = $1`, [
          visible,
        ]),
      ).toMatch(/permission denied/);
      expect(
        await db.queryError(`update public.feedback set message = 'x' where id = $1`, [visible]),
      ).toMatch(/permission denied/);
    }));

  it('cannot un-hide over-quota feedback by updating it', () =>
    withTx(async (db) => {
      const { a, hidden } = await seed(db);
      await db.asUser(a);
      const rows = await db.query(
        `update public.feedback set status = 'resolved' where id = $1 returning id`,
        [hidden],
      );
      expect(rows).toHaveLength(0);
    }));

  it('allows deleting own feedback but not others', () =>
    withTx(async (db) => {
      const { a, visible, foreign } = await seed(db);
      await db.asUser(a);
      expect(
        await db.query('delete from public.feedback where id = $1 returning id', [visible]),
      ).toHaveLength(1);
      expect(
        await db.query('delete from public.feedback where id = $1 returning id', [foreign]),
      ).toHaveLength(0);
    }));

  it('forbids inserting feedback from the client', () =>
    withTx(async (db) => {
      const { a, projectA } = await seed(db);
      await db.asUser(a);
      const error = await db.queryError(
        `insert into public.feedback (project_id, type, message) values ($1, 'bug', 'x')`,
        [projectA.id],
      );
      expect(error).toMatch(/permission denied/);
    }));

  it('cannot delete over-quota feedback via an unfiltered delete', () =>
    withTx(async (db) => {
      const { a, visible, hidden } = await seed(db);
      await db.asUser(a);
      const deleted = await db.query<{ id: string }>('delete from public.feedback returning id');
      expect(deleted.map((r) => r.id)).toEqual([visible]);

      await db.asPostgres();
      const stillThere = await db.query('select id from public.feedback where id = $1', [hidden]);
      expect(stillThere).toEqual([{ id: hidden }]);
    }));

  it('forbids changing project_id, including to a foreign project', () =>
    withTx(async (db) => {
      const { a, visible, projectB } = await seed(db);
      await db.asUser(a);
      expect(
        await db.queryError('update public.feedback set project_id = $1 where id = $2', [
          projectB.id,
          visible,
        ]),
      ).toMatch(/permission denied/);
    }));

  it('anon cannot select feedback', () =>
    withTx(async (db) => {
      await seed(db);
      await db.asAnon();
      expect(await db.queryError('select * from public.feedback')).toMatch(/permission denied/);
    }));
});

describe('backend-only tables', () => {
  const tables = [
    'subscriptions',
    'integrations',
    'telegram_link_codes',
    'usage_counters',
    'rate_limits',
  ] as const;
  const roles = ['anon', 'authenticated'] as const;

  it.each(roles.flatMap((role) => tables.map((table) => [role, table] as const)))(
    '%s cannot read %s',
    (role, table) =>
      withTx(async (db) => {
        const { a } = await seed(db);
        if (role === 'anon') await db.asAnon();
        else await db.asUser(a);
        expect(await db.queryError(`select * from public.${table}`)).toMatch(/permission denied/);
      }),
  );

  it('service role can read everything', () =>
    withTx(async (db) => {
      await seed(db);
      await db.asServiceRole();
      const [row] = await db.query<{ n: number }>(
        'select count(*)::int as n from public.feedback where over_quota',
      );
      expect(row?.n).toBeGreaterThanOrEqual(1);
    }));

  it('service role can insert into projects and feedback', () =>
    withTx(async (db) => {
      const { a, projectA } = await seed(db);
      await db.asServiceRole();
      const [project] = await db.query<{ id: string }>(
        `insert into public.projects (owner_id, name) values ($1, 'svc') returning id`,
        [a],
      );
      expect(project?.id).toBeTruthy();
      const [feedback] = await db.query<{ id: string }>(
        `insert into public.feedback (project_id, type, message) values ($1, 'bug', 'svc')
         returning id`,
        [projectA.id],
      );
      expect(feedback?.id).toBeTruthy();
    }));
});

describe('profiles access', () => {
  it('shows users only their own profile', () =>
    withTx(async (db) => {
      const { a } = await seed(db);
      await db.asUser(a);
      expect(await db.query('select id from public.profiles')).toEqual([{ id: a }]);
    }));

  it('anon cannot select profiles', () =>
    withTx(async (db) => {
      await seed(db);
      await db.asAnon();
      expect(await db.queryError('select * from public.profiles')).toMatch(/permission denied/);
    }));
});

describe('function privileges', () => {
  it.each([
    ['consume_quota', 'select public.consume_quota($1)'],
    ['is_pro', 'select public.is_pro($1)'],
    ['claim_quota_notice', 'select public.claim_quota_notice($1)'],
  ])('%s is not callable by authenticated users', (_, sql) =>
    withTx(async (db) => {
      const { a } = await seed(db);
      await db.asUser(a);
      expect(await db.queryError(sql, [a])).toMatch(/permission denied/);
    }),
  );

  it('hit_rate_limit is not callable by anon', () =>
    withTx(async (db) => {
      await db.asAnon();
      expect(await db.queryError(`select public.hit_rate_limit('k', 1, 60)`)).toMatch(
        /permission denied/,
      );
    }));

  it('hit_rate_limit is not callable by authenticated users', () =>
    withTx(async (db) => {
      const { a } = await seed(db);
      await db.asUser(a);
      expect(await db.queryError(`select public.hit_rate_limit('k', 1, 60)`)).toMatch(
        /permission denied/,
      );
    }));

  it('random_base62 is not callable by authenticated users', () =>
    withTx(async (db) => {
      const { a } = await seed(db);
      await db.asUser(a);
      expect(await db.queryError(`select public.random_base62(8)`)).toMatch(/permission denied/);
    }));

  it('current_user_is_pro is not callable by anon', () =>
    withTx(async (db) => {
      await db.asAnon();
      expect(await db.queryError(`select public.current_user_is_pro()`)).toMatch(
        /permission denied/,
      );
    }));
});

describe('storage and realtime', () => {
  it('has a private screenshots bucket with limits', () =>
    withTx(async (db) => {
      const rows = await db.query(
        `select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'screenshots'`,
      );
      expect(rows).toEqual([
        {
          public: false,
          file_size_limit: '2097152',
          allowed_mime_types: ['image/webp', 'image/png', 'image/jpeg'],
        },
      ]);
    }));

  it('publishes feedback changes to realtime', () =>
    withTx(async (db) => {
      const rows = await db.query(
        `select tablename from pg_publication_tables
         where pubname = 'supabase_realtime' and schemaname = 'public'`,
      );
      expect(rows).toEqual([{ tablename: 'feedback' }]);
    }));
});

describe('default privileges for future objects', () => {
  it('does not grant anon/authenticated execute on functions created later', () =>
    withTx(async (db) => {
      await db.query(
        `create function public.tmp_guard_fn() returns int language sql as 'select 1'`,
      );
      const rows = await db.query<{ anon_ok: boolean; authenticated_ok: boolean }>(
        `select has_function_privilege('anon', 'public.tmp_guard_fn()', 'execute') as anon_ok,
                has_function_privilege('authenticated', 'public.tmp_guard_fn()', 'execute') as authenticated_ok`,
      );
      expect(rows).toEqual([{ anon_ok: false, authenticated_ok: false }]);
    }));

  it('does not grant anon/authenticated select on tables created later', () =>
    withTx(async (db) => {
      await db.query(`create table public.tmp_guard_table (id int)`);
      const rows = await db.query<{ anon_ok: boolean; authenticated_ok: boolean }>(
        `select has_table_privilege('anon', 'public.tmp_guard_table', 'select') as anon_ok,
                has_table_privilege('authenticated', 'public.tmp_guard_table', 'select') as authenticated_ok`,
      );
      expect(rows).toEqual([{ anon_ok: false, authenticated_ok: false }]);
    }));
});
