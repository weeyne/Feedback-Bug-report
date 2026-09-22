import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { attributeReferral } from '@/lib/auth/referral';
import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { getDeps } from '@/lib/deps';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  if (code) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      const store = await cookies();
      const ref = store.get('ref')?.value;
      if (ref) {
        await attributeReferral((await getDeps()).db, data.user.id, ref).catch((e: unknown) =>
          console.error('[auth/callback] referral', e),
        );
        store.delete('ref');
      }
      return NextResponse.redirect(new URL('/app', url.origin));
    }
  }
  return NextResponse.redirect(new URL('/login?error=callback', url.origin));
}
