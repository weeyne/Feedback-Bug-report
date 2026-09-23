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
