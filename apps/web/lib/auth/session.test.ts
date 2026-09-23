import { cookies } from 'next/headers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getEnv } from '../env';
import { getSessionUser, parseE2eUser } from './session';
import { createSupabaseServerClient } from './supabase-server';

vi.mock('../env', () => ({ getEnv: vi.fn() }));
vi.mock('./supabase-server', () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: vi.fn() }));

describe('parseE2eUser', () => {
  it('accepts a JSON cookie with a uuid and email', () => {
    const raw = JSON.stringify({ id: '8c0e2f36-3c5e-4f63-9d5b-0a4d1b1f6a10', email: 'a@b.co' });
    expect(parseE2eUser(raw)).toEqual({
      id: '8c0e2f36-3c5e-4f63-9d5b-0a4d1b1f6a10',
      email: 'a@b.co',
    });
  });

  it.each([undefined, '', 'not json', JSON.stringify({ id: 'x', email: 'a@b.co' })])(
    'rejects %s',
    (raw) => {
      expect(parseE2eUser(raw)).toBeNull();
    },
  );
});

describe('getSessionUser', () => {
  afterEach(() => {
    vi.resetAllMocks();
    vi.unstubAllEnvs();
  });

  it('trusts the e2e cookie in test mode outside production', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.mocked(getEnv).mockReturnValue({ BUGPING_TEST_MODE: '1' } as ReturnType<typeof getEnv>);
    const raw = JSON.stringify({ id: '8c0e2f36-3c5e-4f63-9d5b-0a4d1b1f6a10', email: 'a@b.co' });
    vi.mocked(cookies).mockResolvedValue({
      get: () => ({ name: 'e2e_user', value: raw }),
    } as unknown as Awaited<ReturnType<typeof cookies>>);

    await expect(getSessionUser()).resolves.toEqual({
      id: '8c0e2f36-3c5e-4f63-9d5b-0a4d1b1f6a10',
      email: 'a@b.co',
    });
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it('ignores the e2e cookie in production even when BUGPING_TEST_MODE=1', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.mocked(getEnv).mockReturnValue({ BUGPING_TEST_MODE: '1' } as ReturnType<typeof getEnv>);
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { getClaims: async () => ({ data: null }) },
    } as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>);

    await expect(getSessionUser()).resolves.toBeNull();
    expect(createSupabaseServerClient).toHaveBeenCalled();
    expect(cookies).not.toHaveBeenCalled();
  });
});
