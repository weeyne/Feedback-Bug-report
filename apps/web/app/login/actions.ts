'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { magicLinkLimited } from '@/lib/auth/magic-link-limit';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { getDeps } from '@/lib/deps';
import { getEnv } from '@/lib/env';
import { clientIp } from '@/lib/http';

export interface LoginState {
  status: 'idle' | 'sent' | 'error';
  error?: string;
  email?: string;
}

export async function sendMagicLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = z
    .email()
    .max(254)
    .safeParse(String(formData.get('email') ?? '').trim());
  if (!email.success) return { status: 'error', error: 'auth.emailInvalid' };
  if (getEnv().BUGPING_TEST_MODE === '1' && process.env.NODE_ENV !== 'production') {
    return { status: 'sent', email: email.data };
  }
  const env = getEnv();
  const ip = clientIp(await headers(), env.CLIENT_IP_HEADER);
  if (await magicLinkLimited((await getDeps()).db, env.IP_HASH_SALT, ip, email.data)) {
    return { status: 'error', error: 'auth.rateLimited' };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: email.data,
    options: { emailRedirectTo: `${getEnv().NEXT_PUBLIC_APP_URL}/auth/callback` },
  });
  return error
    ? { status: 'error', error: 'auth.sendFailed' }
    : { status: 'sent', email: email.data };
}

export async function signInWithGitHub(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'github',
    options: { redirectTo: `${getEnv().NEXT_PUBLIC_APP_URL}/auth/callback` },
  });
  redirect(error || !data.url ? '/login?error=oauth' : data.url);
}
