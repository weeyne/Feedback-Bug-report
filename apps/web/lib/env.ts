import { PUBLIC_KEY_PATTERN } from '@bugping/shared';
import { z } from 'zod';

/** Vercel sometimes stores an unset variable as an empty string; treat that as unset. */
function optionalWhenEmpty<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((value) => (value === '' ? undefined : value), schema.optional());
}

const EnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  NEXT_PUBLIC_BUGPING_PROJECT_KEY: z.string().regex(PUBLIC_KEY_PATTERN).optional(),
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
  BUGPING_TEST_MODE: z.enum(['0', '1']).optional(),
  PADDLE_API_KEY: optionalWhenEmpty(z.string().min(20)),
  PADDLE_WEBHOOK_SECRET: optionalWhenEmpty(z.string().min(16)),
  PADDLE_PRICE_MONTHLY: optionalWhenEmpty(z.string().regex(/^pri_\w+$/)),
  PADDLE_PRICE_LIFETIME: optionalWhenEmpty(z.string().regex(/^pri_\w+$/)),
  NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: optionalWhenEmpty(z.string().regex(/^(test|live)_\w+$/)),
  NEXT_PUBLIC_PADDLE_ENV: optionalWhenEmpty(z.enum(['sandbox', 'production'])),
});

export type Env = z.infer<typeof EnvSchema>;

/** Billing is optional: all six Paddle variables must be set together, or none at all. */
export const PADDLE_VARS = [
  'PADDLE_API_KEY',
  'PADDLE_WEBHOOK_SECRET',
  'PADDLE_PRICE_MONTHLY',
  'PADDLE_PRICE_LIFETIME',
  'NEXT_PUBLIC_PADDLE_CLIENT_TOKEN',
  'NEXT_PUBLIC_PADDLE_ENV',
] as const;

const EnvSchemaWithGroups = EnvSchema.superRefine((env, ctx) => {
  const present = PADDLE_VARS.filter((name) => env[name] !== undefined);
  if (present.length === 0 || present.length === PADDLE_VARS.length) return;
  for (const name of PADDLE_VARS) {
    if (env[name] === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: [name],
        message: 'required when billing is configured',
      });
    }
  }
});

/** Validates the environment. Errors name the variables but never echo their values. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = EnvSchemaWithGroups.safeParse(source);
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
