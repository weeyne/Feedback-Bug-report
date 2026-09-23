import {
  createProject,
  createUser,
  grantPro,
  withTx,
  type TestDb,
} from '@bugping/db-tests/harness';
import { WidgetConfigSchema } from '@bugping/shared';
import { describe, expect, it } from 'vitest';
import { handleConfig } from './config';

const get = (db: TestDb, key: string) =>
  handleConfig(
    { db, env: { NEXT_PUBLIC_APP_URL: 'https://app.example' } },
    new Request(`https://dymcode.dev/api/v1/widget/config?key=${key}`, {
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
});
