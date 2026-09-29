import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST as login } from './login/route';
import { DELETE as clearOutbox, GET as outbox } from './outbox/route';
import { POST as usage } from './usage/route';

afterEach(() => {
  vi.unstubAllEnvs();
});

const post = () => new Request('http://localhost/api/e2e-test', { method: 'POST', body: '{}' });

describe('E2E test routes', () => {
  it.each([
    ['test mode off', '0', 'development'],
    ['a production build with test mode set', '1', 'production'],
  ])('answer 404 with %s', async (_label, mode, nodeEnv) => {
    vi.stubEnv('BUGPING_TEST_MODE', mode);
    vi.stubEnv('NODE_ENV', nodeEnv);
    expect((await login(post())).status).toBe(404);
    expect((await usage(post())).status).toBe(404);
    expect((await outbox()).status).toBe(404);
    expect((await clearOutbox()).status).toBe(404);
  });
});
