import type { Env } from '../env';

export interface BillingConfig {
  apiKey: string;
  webhookSecret: string;
  priceMonthly: string;
  priceLifetime: string;
  clientToken: string;
  environment: 'sandbox' | 'production';
  apiBase: string;
}

let mismatchLogged = false;

/** A key whose prefix names the other environment (unprefixed keys are not judged). */
function keysMismatch(env: Env): boolean {
  const sandbox = env.NEXT_PUBLIC_PADDLE_ENV === 'sandbox';
  const key = env.PADDLE_API_KEY ?? '';
  const token = env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN ?? '';
  if (key.startsWith(sandbox ? 'pdl_live_' : 'pdl_sdbx_')) return true;
  return token.startsWith(sandbox ? 'live_' : 'test_');
}

/** Null when billing is not configured (parseEnv already rejected a partial group). */
export function billingConfig(env: Env): BillingConfig | null {
  if (
    !env.PADDLE_API_KEY ||
    !env.PADDLE_WEBHOOK_SECRET ||
    !env.PADDLE_PRICE_MONTHLY ||
    !env.PADDLE_PRICE_LIFETIME ||
    !env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN ||
    !env.NEXT_PUBLIC_PADDLE_ENV
  ) {
    return null;
  }
  if (keysMismatch(env)) {
    if (!mismatchLogged) {
      mismatchLogged = true;
      console.error(
        `[billing] Paddle keys do not match NEXT_PUBLIC_PADDLE_ENV=${env.NEXT_PUBLIC_PADDLE_ENV}; billing is disabled`,
      );
    }
    return null;
  }
  return {
    apiKey: env.PADDLE_API_KEY,
    webhookSecret: env.PADDLE_WEBHOOK_SECRET,
    priceMonthly: env.PADDLE_PRICE_MONTHLY,
    priceLifetime: env.PADDLE_PRICE_LIFETIME,
    clientToken: env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN,
    environment: env.NEXT_PUBLIC_PADDLE_ENV,
    apiBase:
      env.NEXT_PUBLIC_PADDLE_ENV === 'sandbox'
        ? 'https://sandbox-api.paddle.com'
        : 'https://api.paddle.com',
  };
}
