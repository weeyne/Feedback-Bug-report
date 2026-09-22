import { PUBLIC_KEY_PATTERN } from '@dymcode/shared';
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const REF_MAX_AGE = 60 * 60 * 24 * 30;

interface AuthResult {
  userId: string | null;
  /** May be a fresh NextResponse (Supabase rewrote it while refreshing the session). */
  response: NextResponse;
}

async function currentUser(request: NextRequest, response: NextResponse): Promise<AuthResult> {
  if (process.env.DYMCODE_TEST_MODE === '1') {
    try {
      const userId = JSON.parse(request.cookies.get('e2e_user')?.value ?? 'null')?.id ?? null;
      return { userId, response };
    } catch {
      return { userId: null, response };
    }
  }
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          // NextResponse.next({ request }) bakes in the forwarded request headers at
          // construction time, so refreshed cookies must land on the *request* first,
          // then the response has to be recreated from that updated request before the
          // cookies (with their options) are copied onto it. See the @supabase/ssr guide.
          for (const { name, value } of list) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of list) response.cookies.set(name, value, options);
        },
      },
    },
  );
  const { data } = await supabase.auth.getClaims();
  const userId = (data?.claims?.sub as string | undefined) ?? null;
  return { userId, response };
}

export async function proxy(request: NextRequest) {
  const { userId, response } = await currentUser(request, NextResponse.next({ request }));
  const pathname = request.nextUrl.pathname;

  if ((pathname === '/app' || pathname.startsWith('/app/')) && !userId) {
    const login = NextResponse.redirect(new URL('/login', request.url));
    for (const cookie of response.cookies.getAll()) login.cookies.set(cookie);
    return login;
  }

  const ref = request.nextUrl.searchParams.get('ref');
  if (ref && PUBLIC_KEY_PATTERN.test(ref)) {
    response.cookies.set('ref', ref, {
      maxAge: REF_MAX_AGE,
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: request.nextUrl.protocol === 'https:',
    });
  }
  return response;
}

export const config = {
  // Skip static files, the widget bundle and the public API.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|w/|api/).*)'],
};
