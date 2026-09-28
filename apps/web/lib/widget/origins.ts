/** The part of an origin that names a site: hostname without one leading `www.`, plus a non-default port. */
export function siteKey(origin: string): string | null {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  return url.port ? `${host}:${url.port}` : host;
}

/** `scheme://host[:port]` of an http(s) URL, or null. */
export function parseOrigin(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : null;
  } catch {
    return null;
  }
}

/**
 * Whether a request's `Origin` may use a project whose allow-list is `allowed` (empty = any site).
 * Apex and `www`, http and https count as one site; ports and other subdomains do not.
 */
export function originAllowed(origin: string | null, allowed: readonly string[]): boolean {
  if (allowed.length === 0) return true;
  const key = origin ? siteKey(origin) : null;
  if (!key) return false;
  return allowed.some((entry) => siteKey(entry) === key);
}
