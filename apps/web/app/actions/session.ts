'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { E2E_USER_COOKIE } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { testModeEnabled } from '@/lib/test-mode-guard';

export async function signOut(): Promise<void> {
  if (testModeEnabled()) {
    (await cookies()).delete(E2E_USER_COOKIE);
  } else {
    await (await createSupabaseServerClient()).auth.signOut();
  }
  redirect('/');
}
