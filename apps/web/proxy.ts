import { PUBLIC_KEY_PATTERN } from '@dymcode/shared';
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const REF_MAX_AGE = 60 * 60 * 24 * 30;

async function currentUserId(request: NextRequest, response: NextResponse): Promise<string | null> {
  if (process.env.DYMCODE_TEST_MODE === '1') {
    try {
      return JSON.parse(request.cookies.get('e2e_user')?.value ?? 'null')?.id ?? null;
    } catch {
      return null;
    }
  }
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          for (const { name, value, options } of list) {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );
  const { data } = await supabase.auth.getClaims();
  return (data?.claims?.sub as string | undefined) ?? null;
}

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });
  const userId = await currentUserId(request, response);

  if (request.nextUrl.pathname.startsWith('/app') && !userId) {
    const login = new URL('/login', request.url);
    return NextResponse.redirect(login);
  }

  const ref = request.nextUrl.searchParams.get('ref');
  if (ref && PUBLIC_KEY_PATTERN.test(ref)) {
    response.cookies.set('ref', ref, {
      maxAge: REF_MAX_AGE,
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    });
  }
  return response;
}

export const config = {
  // Skip static files, the widget bundle and the public API.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|w/|api/).*)'],
};
