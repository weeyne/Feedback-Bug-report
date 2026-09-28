import { isIPv4, isIPv6 } from 'node:net';

export function corsHeaders(origin: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin ?? '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    Vary: 'Origin',
  };
}

export function preflight(request: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('origin')) });
}

export function json(
  body: unknown,
  status: number,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

let warnedAboutMissingClientIpHeader = false;

/**
 * The client's IP. With `trustedHeader` (e.g. `cf-connecting-ip` behind Cloudflare) only that header counts;
 * without it, the first x-forwarded-for hop, then x-real-ip — both set by Vercel, spoofable anywhere else.
 */
export function clientIp(headers: Headers, trustedHeader?: string): string {
  if (trustedHeader) {
    const value = headers.get(trustedHeader)?.split(',')[0]?.trim();
    if (value) return value;
    if (!warnedAboutMissingClientIpHeader) {
      warnedAboutMissingClientIpHeader = true;
      console.warn(
        `[http] CLIENT_IP_HEADER "${trustedHeader}" is set but missing from the request; all clients share one rate-limit bucket`,
      );
    }
    return 'unknown';
  }
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || headers.get('x-real-ip')?.trim() || 'unknown';
}

/** Test-only: resets the one-time missing-header warning between tests. */
export function resetClientIpWarning(): void {
  warnedAboutMissingClientIpHeader = false;
}

/**
 * The rate-limit identity of a client: IPv4 as is, IPv6 reduced to its /64 prefix (one subscriber
 * usually owns a whole /64), IPv4-mapped IPv6 back to plain IPv4.
 */
export function rateLimitIdentity(ip: string): string {
  const address = ip.replace(/^\[|\]$/g, '').replace(/%.*$/, '');
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped && isIPv4(mapped[1]!)) return mapped[1]!;
  if (!isIPv6(address)) return address;
  const lower = address.toLowerCase();
  let groups: string[];
  if (lower.includes('::')) {
    const [head = '', tail = ''] = lower.split('::');
    const headParts = head ? head.split(':') : [];
    const tailParts = tail ? tail.split(':') : [];
    const zeros = Array<string>(Math.max(0, 8 - headParts.length - tailParts.length)).fill('0');
    groups = [...headParts, ...zeros, ...tailParts];
  } else {
    groups = lower.split(':');
  }
  const prefix = groups.slice(0, 4).map((group) => group.replace(/^0+(?=.)/, ''));
  return `${prefix.join(':')}::/64`;
}
