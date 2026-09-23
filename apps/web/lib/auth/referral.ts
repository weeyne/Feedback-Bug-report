import { PUBLIC_KEY_PATTERN } from '@bugping/shared';
import type { Db } from '../db/types';

/**
 * Credits a newly created account (<= 1 day old) to the project whose badge referred it.
 * Never overwrites an existing attribution and never credits a user's own project.
 */
export async function attributeReferral(db: Db, userId: string, ref: string): Promise<boolean> {
  if (!PUBLIC_KEY_PATTERN.test(ref)) return false;
  const rows = await db.query<{ id: string }>(
    `update public.profiles pr set referred_by_project = p.id
     from public.projects p
     where pr.id = $1 and pr.referred_by_project is null and pr.created_at > now() - interval '1 day'
       and p.public_key = $2 and p.owner_id <> $1
     returning pr.id`,
    [userId, ref],
  );
  return rows.length > 0;
}
