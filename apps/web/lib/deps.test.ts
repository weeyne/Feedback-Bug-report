import { afterEach, describe, expect, it, vi } from 'vitest';
import { VALID_ENV } from '@/test/fixtures';
import { getDeps } from './deps';
import { getEnv, parseEnv } from './env';

vi.mock('./env', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./env')>()),
  getEnv: vi.fn(),
}));

afterEach(() => {
  globalThis.__bugpingDeps = undefined;
  vi.mocked(getEnv).mockReset();
});

describe('getDeps', () => {
  it('retries after a failed build instead of caching the rejection', async () => {
    vi.mocked(getEnv)
      .mockImplementationOnce(() => {
        throw new Error('bad env');
      })
      .mockImplementation(() => parseEnv(VALID_ENV));

    await expect(getDeps()).rejects.toThrow('bad env');
    const deps = await getDeps();
    expect(deps.env.NEXT_PUBLIC_APP_URL).toBe(VALID_ENV.NEXT_PUBLIC_APP_URL);
    expect(getEnv).toHaveBeenCalledTimes(2);
  });

  it('builds once and shares the instance', async () => {
    vi.mocked(getEnv).mockImplementation(() => parseEnv(VALID_ENV));
    const [a, b] = await Promise.all([getDeps(), getDeps()]);
    expect(a).toBe(b);
    expect(getEnv).toHaveBeenCalledTimes(1);
  });
});
