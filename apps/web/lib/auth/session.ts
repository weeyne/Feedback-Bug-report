import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { getEnv } from '../env';
import { createSupabaseServerClient } from './supabase-server';

export interface SessionUser {
  id: string;
  email: string;
}

export const E2E_USER_COOKIE = 'e2e_user';

const E2eUser = z.object({ id: z.uuid(), email: z.string().max(254) });

export function parseE2eUser(raw: string | undefined): SessionUser | null {
  if (!raw) return null;
  try {
    const parsed = E2eUser.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function getSessionUser(): Promise<SessionUser | null> {
  if (getEnv().DYMCODE_TEST_MODE === '1') {
    return parseE2eUser((await cookies()).get(E2E_USER_COOKIE)?.value);
  }
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  return { id: String(claims.sub), email: String(claims.email ?? '') };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  return user;
}
