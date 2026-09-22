import { PUBLIC_KEY_PATTERN } from '@dymcode/shared';
import { z } from 'zod';

const PublicEnvSchema = z.object({
  appUrl: z
    .string()
    .optional()
    .transform((value) => (value ? value.replace(/\/+$/, '') : 'http://localhost:3000'))
    .pipe(z.url()),
  dymcodeProjectKey: z
    .string()
    .optional()
    .transform((value) => (value ? value : undefined))
    .pipe(z.string().regex(PUBLIC_KEY_PATTERN).optional()),
});

export interface PublicEnv {
  appUrl: string;
  dymcodeProjectKey?: string;
}

/**
 * Validates only the public, non-secret env vars needed to render marketing/SEO
 * routes. Unlike `getEnv`, this never requires Supabase, database or Telegram
 * secrets, so it is safe to call from statically prerendered routes (robots.ts,
 * sitemap.ts, the root layout's `generateMetadata`) where a build can run without
 * a full `.env.local` (e.g. CI). Reads `process.env` directly on every call so
 * tests can stub different values without needing to reset a module cache.
 */
export function getPublicEnv(): PublicEnv {
  if (process.env.VERCEL_ENV === 'production' && !process.env.NEXT_PUBLIC_APP_URL) {
    throw new Error('NEXT_PUBLIC_APP_URL is required when VERCEL_ENV=production');
  }
  const result = PublicEnvSchema.safeParse({
    appUrl: process.env.NEXT_PUBLIC_APP_URL,
    dymcodeProjectKey: process.env.NEXT_PUBLIC_DYMCODE_PROJECT_KEY,
  });
  if (!result.success) {
    const names = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))];
    throw new Error(`Invalid public environment variables: ${names.join(', ')}`);
  }
  return result.data;
}
