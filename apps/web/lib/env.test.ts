import { describe, expect, it } from 'vitest';
import { PADDLE_ENV, VALID_ENV } from '@/test/fixtures';
import { parseEnv } from './env';

describe('parseEnv', () => {
  it('accepts a complete environment', () => {
    expect(parseEnv(VALID_ENV).TELEGRAM_BOT_USERNAME).toBe('dymcode_bot');
  });

  it('lists invalid variable names without leaking values', () => {
    const bad = { ...VALID_ENV, SECRETS_ENCRYPTION_KEY: 'c2hvcnQ=', TELEGRAM_BOT_TOKEN: undefined };
    expect(() => parseEnv(bad)).toThrow(/SECRETS_ENCRYPTION_KEY/);
    expect(() => parseEnv(bad)).toThrow(/TELEGRAM_BOT_TOKEN/);
    expect(() => parseEnv(bad)).not.toThrow(/c2hvcnQ=/);
  });

  it('accepts an optional test-mode flag', () => {
    expect(parseEnv({ ...VALID_ENV, DYMCODE_TEST_MODE: '1' }).DYMCODE_TEST_MODE).toBe('1');
    expect(() => parseEnv({ ...VALID_ENV, DYMCODE_TEST_MODE: 'yes' })).toThrow(/DYMCODE_TEST_MODE/);
  });

  it('requires the publishable key and accepts an optional own project key', () => {
    const { NEXT_PUBLIC_SUPABASE_ANON_KEY: _, ...withoutAnon } = VALID_ENV;
    expect(() => parseEnv(withoutAnon)).toThrow(/NEXT_PUBLIC_SUPABASE_ANON_KEY/);
    expect(
      parseEnv({ ...VALID_ENV, NEXT_PUBLIC_DYMCODE_PROJECT_KEY: 'pk_AbCdEfGh12345678' })
        .NEXT_PUBLIC_DYMCODE_PROJECT_KEY,
    ).toBe('pk_AbCdEfGh12345678');
    expect(() => parseEnv({ ...VALID_ENV, NEXT_PUBLIC_DYMCODE_PROJECT_KEY: 'nope' })).toThrow(
      /NEXT_PUBLIC_DYMCODE_PROJECT_KEY/,
    );
  });

  it('accepts no Paddle group or a complete one, and rejects a partial one', () => {
    expect(parseEnv(VALID_ENV).PADDLE_API_KEY).toBeUndefined();
    expect(parseEnv({ ...VALID_ENV, ...PADDLE_ENV }).NEXT_PUBLIC_PADDLE_ENV).toBe('sandbox');
    const { PADDLE_WEBHOOK_SECRET: _, ...partial } = PADDLE_ENV;
    expect(() => parseEnv({ ...VALID_ENV, ...partial })).toThrow(/PADDLE_WEBHOOK_SECRET/);
    expect(() => parseEnv({ ...VALID_ENV, ...partial })).not.toThrow(/pdl_sdbx/);
    expect(() => parseEnv({ ...VALID_ENV, ...PADDLE_ENV, NEXT_PUBLIC_PADDLE_ENV: 'live' })).toThrow(
      /NEXT_PUBLIC_PADDLE_ENV/,
    );
  });
});
