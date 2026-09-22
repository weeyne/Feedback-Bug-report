import { z } from 'zod';

const EnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//),
  NEXT_PUBLIC_APP_URL: z.url(),
  SECRETS_ENCRYPTION_KEY: z
    .string()
    .refine((value) => Buffer.from(value, 'base64').length === 32, 'must be 32 bytes, base64'),
  IP_HASH_SALT: z.string().min(16),
  CRON_SECRET: z.string().min(16),
  TELEGRAM_BOT_TOKEN: z.string().regex(/^\d+:[\w-]+$/),
  TELEGRAM_BOT_USERNAME: z.string().regex(/^\w{5,32}$/),
  TELEGRAM_WEBHOOK_SECRET: z.string().regex(/^[\w-]{16,256}$/),
  DYMCODE_TEST_MODE: z.enum(['0', '1']).optional(),
});

export type Env = z.infer<typeof EnvSchema>;

/** Validates the environment. Errors name the variables but never echo their values. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const names = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))];
    throw new Error(`Invalid environment variables: ${names.join(', ')}`);
  }
  return result.data;
}

let cached: Env | undefined;

export function getEnv(): Env {
  return (cached ??= parseEnv(process.env));
}
