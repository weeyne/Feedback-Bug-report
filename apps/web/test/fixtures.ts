/** A complete, valid set of fake environment variables for tests. */
export const VALID_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_0123456789abcdefghij',
  DATABASE_URL: 'postgresql://postgres.ref:pw@aws-0-eu-west-2.pooler.supabase.com:6543/postgres',
  NEXT_PUBLIC_APP_URL: 'https://dymcode.dev',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_0123456789abcdef',
  SECRETS_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  IP_HASH_SALT: '0123456789abcdef0123456789abcdef',
  CRON_SECRET: 'fedcba9876543210fedcba9876543210',
  TELEGRAM_BOT_TOKEN: '123456:ABC-def_ghi',
  TELEGRAM_BOT_USERNAME: 'dymcode_bot',
  TELEGRAM_WEBHOOK_SECRET: 'webhook-secret-0123456789',
};
