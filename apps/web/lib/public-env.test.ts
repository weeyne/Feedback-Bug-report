import { afterEach, describe, expect, it } from 'vitest';
import { getPublicEnv } from './public-env';

describe('getPublicEnv', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('falls back to localhost when appUrl is unset outside production', () => {
    delete process.env.VERCEL_ENV;
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(getPublicEnv().appUrl).toBe('http://localhost:3000');
  });

  it('throws when VERCEL_ENV=production and NEXT_PUBLIC_APP_URL is unset', () => {
    process.env.VERCEL_ENV = 'production';
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(() => getPublicEnv()).toThrow(/NEXT_PUBLIC_APP_URL/);
  });

  it('throws when VERCEL_ENV=production and NEXT_PUBLIC_APP_URL is empty', () => {
    process.env.VERCEL_ENV = 'production';
    process.env.NEXT_PUBLIC_APP_URL = '';
    expect(() => getPublicEnv()).toThrow(/NEXT_PUBLIC_APP_URL/);
  });

  it('succeeds when VERCEL_ENV=production and NEXT_PUBLIC_APP_URL is set', () => {
    process.env.VERCEL_ENV = 'production';
    process.env.NEXT_PUBLIC_APP_URL = 'https://dymcode.com';
    expect(getPublicEnv().appUrl).toBe('https://dymcode.com');
  });

  it('does not require NEXT_PUBLIC_APP_URL for preview/dev VERCEL_ENV', () => {
    process.env.VERCEL_ENV = 'preview';
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(getPublicEnv().appUrl).toBe('http://localhost:3000');
  });
});
