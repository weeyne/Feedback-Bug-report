import { describe, expect, it } from 'vitest';
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
    });
    expect(billingConfig(live)?.apiBase).toBe('https://api.paddle.com');
  });
});
