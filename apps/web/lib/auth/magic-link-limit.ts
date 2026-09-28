import { createHash } from 'node:crypto';
import type { Db } from '../db/types';
import { rateLimitIdentity } from '../http';

export const MAGIC_LINK_LIMITS = {
  ip: { max: 5, windowSeconds: 900 },
  email: { max: 3, windowSeconds: 900 },
} as const;

const digest = (value: string, salt: string) =>
  createHash('sha256')
    .update(value + salt)
    .digest('hex');

/** Counts one magic-link request; true when its IP or its address is over the limit. */
export async function magicLinkLimited(
  db: Db,
  salt: string,
  ip: string,
  email: string,
): Promise<boolean> {
  const hit = async (key: string, limit: { max: number; windowSeconds: number }) => {
    const [row] = await db.query<{ limited: boolean }>(
      'select public.hit_rate_limit($1, $2, $3) as limited',
      [key, limit.max, limit.windowSeconds],
    );
    return Boolean(row?.limited);
  };
  const byIp = await hit(`magic-ip:${digest(rateLimitIdentity(ip), salt)}`, MAGIC_LINK_LIMITS.ip);
  const byEmail = await hit(
    `magic-email:${digest(email.toLowerCase(), salt)}`,
    MAGIC_LINK_LIMITS.email,
  );
  return byIp || byEmail;
}
