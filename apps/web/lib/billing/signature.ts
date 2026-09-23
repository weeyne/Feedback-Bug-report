import { createHmac, timingSafeEqual } from 'node:crypto';

const TOLERANCE_SEC = 300;

const hmac = (rawBody: string, secret: string, ts: string) =>
  createHmac('sha256', secret).update(`${ts}:${rawBody}`).digest('hex');

/** Builds a `Paddle-Signature` header value (tests and E2E). */
export function signPaddle(rawBody: string, secret: string, ts: number): string {
  return `ts=${ts};h1=${hmac(rawBody, secret, String(ts))}`;
}

export function verifyPaddleSignature(
  rawBody: string,
  header: string | null,
  secret: string,
  nowMs: number,
): boolean {
  if (!header) return false;
  let ts: string | null = null;
  const h1: string[] = [];
  for (const part of header.split(';')) {
    const [key, value] = part.split('=', 2);
    if (key === 'ts' && value) ts = value;
    else if (key === 'h1' && value) h1.push(value);
  }
  if (!ts || !/^\d+$/.test(ts) || h1.length === 0) return false;
  if (Math.abs(nowMs / 1000 - Number(ts)) > TOLERANCE_SEC) return false;
  const expected = Buffer.from(hmac(rawBody, secret, ts), 'hex');
  return h1.some((candidate) => {
    if (!/^[0-9a-f]{64}$/i.test(candidate)) return false;
    return timingSafeEqual(Buffer.from(candidate, 'hex'), expected);
  });
}
