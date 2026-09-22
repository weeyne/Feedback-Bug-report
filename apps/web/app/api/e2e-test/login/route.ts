import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { E2E_USER_COOKIE } from '@/lib/auth/session';
import { getDeps } from '@/lib/deps';
import { getEnv } from '@/lib/env';
import { json } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** E2E only: signs in as (and creates if needed) the user with the given email. */
export async function POST(request: Request) {
  if (getEnv().DYMCODE_TEST_MODE !== '1') return json({ error: 'not found' }, 404);
  const { email } = (await request.json()) as { email: string };
  const { db } = await getDeps();
  let [user] = await db.query<{ id: string }>('select id from auth.users where email = $1', [
    email,
  ]);
  if (!user) {
    [user] = await db.query<{ id: string }>(
      `insert into auth.users (id, instance_id, aud, role, email)
       values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2) returning id`,
      [randomUUID(), email],
    );
  }
  (await cookies()).set(E2E_USER_COOKIE, JSON.stringify({ id: user!.id, email }), {
    path: '/',
    httpOnly: true,
  });
  return json({ id: user!.id }, 200);
}
