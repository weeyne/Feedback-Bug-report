import { describe, expect, it, vi } from 'vitest';
import { PADDLE_ENV, VALID_ENV } from '@/test/fixtures';
import { parseEnv } from '../env';
import { billingConfig } from './config';

describe('billingConfig', () => {
  it('is null when billing is not configured', () => {
    expect(billingConfig(parseEnv(VALID_ENV))).toBeNull();
  });

  it('picks the sandbox or production API base', () => {
    expect(billingConfig(parseEnv({ ...VALID_ENV, ...PADDLE_ENV }))).toEqual({
      apiKey: PADDLE_ENV.PADDLE_API_KEY,
      webhookSecret: PADDLE_ENV.PADDLE_WEBHOOK_SECRET,
      priceMonthly: PADDLE_ENV.PADDLE_PRICE_MONTHLY,
      priceLifetime: PADDLE_ENV.PADDLE_PRICE_LIFETIME,
      clientToken: PADDLE_ENV.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN,
      environment: 'sandbox',
      apiBase: 'https://sandbox-api.paddle.com',
    });
    const live = parseEnv({
      ...VALID_ENV,
      ...PADDLE_ENV,
      NEXT_PUBLIC_PADDLE_ENV: 'production',
      NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: 'live_0123456789abcdef0123',
      PADDLE_API_KEY: 'pdl_live_apikey_0123456789abcdefghij',
    });
    expect(billingConfig(live)?.apiBase).toBe('https://api.paddle.com');
  });

  it('disables billing when the keys do not match the environment, without logging values', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const cases = [
      { NEXT_PUBLIC_PADDLE_ENV: 'sandbox', PADDLE_API_KEY: 'pdl_live_apikey_0123456789abcdefghij' },
      {
        NEXT_PUBLIC_PADDLE_ENV: 'production',
        NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: 'live_0123456789abcdef0123',
        PADDLE_API_KEY: 'pdl_sdbx_apikey_0123456789abcdefghij',
      },
      {
        NEXT_PUBLIC_PADDLE_ENV: 'production',
        PADDLE_API_KEY: 'pdl_live_apikey_0123456789abcdefghij',
      },
      {
        NEXT_PUBLIC_PADDLE_ENV: 'sandbox',
        NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: 'live_0123456789abcdef0123',
      },
    ];
    for (const overrides of cases) {
      expect(billingConfig(parseEnv({ ...VALID_ENV, ...PADDLE_ENV, ...overrides }))).toBeNull();
    }
    const logged = error.mock.calls.flat().join(' ');
    expect(logged).toContain('billing is disabled');
    expect(logged).not.toMatch(/pdl_|live_0123|test_0123/);
    error.mockRestore();
  });

  it('does not judge an API key without a known prefix', () => {
    expect(
      billingConfig(
        parseEnv({ ...VALID_ENV, ...PADDLE_ENV, PADDLE_API_KEY: '0123456789abcdef0123456789' }),
      ),
    ).not.toBeNull();
  });
});
