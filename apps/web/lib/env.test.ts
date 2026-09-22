import { describe, expect, it } from 'vitest';
import { VALID_ENV } from '@/test/fixtures';
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
});
