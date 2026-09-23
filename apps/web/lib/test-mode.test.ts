import { describe, expect, it } from 'vitest';
import { VALID_ENV } from '@/test/fixtures';
import { parseEnv } from './env';
import { assertTestModeAllowed, createTestModeDeps, E2E_PROJECT_KEY } from './test-mode';

describe('test mode', () => {
  it('refuses to run in production', () => {
    const env = parseEnv({ ...VALID_ENV, BUGPING_TEST_MODE: '1' });
    expect(() => assertTestModeAllowed(env, 'production')).toThrow(/production/);
    expect(() => assertTestModeAllowed(env, 'development')).not.toThrow();
  });

  it('boots an in-memory database with seeded projects and records outbound calls', async () => {
    const deps = await createTestModeDeps(parseEnv({ ...VALID_ENV, BUGPING_TEST_MODE: '1' }));
    const [project] = await deps.db.query<{ name: string }>(
      'select name from public.projects where public_key = $1',
      [E2E_PROJECT_KEY],
    );
    expect(project?.name).toBe('E2E Shop');
    await deps.fetch('https://api.telegram.org/botX/sendMessage', {
      method: 'POST',
      body: JSON.stringify({ text: 'hi' }),
    });
    expect(deps.outbox).toEqual([
      { url: 'https://api.telegram.org/botX/sendMessage', body: { text: 'hi' } },
    ]);
  });
});
