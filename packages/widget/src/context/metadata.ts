import type { ClientMetadata, ConsoleError } from '@dymcode/shared';

/** What the host page passed to `Dymcode.identify()`. */
export interface IdentifiedUser {
  email?: string;
  id?: string;
  name?: string;
}

const SENSITIVE_PARAM =
  /^(token|access_token|refresh_token|id_token|code|key|secret|password|pass|auth|session|signature|sig)$/i;
const REDACTED = '[redacted]';

/** Replaces the values of sensitive `name=value` pairs in an `&`-separated query string. */
function redactPairs(query: string): string {
  return query
    .split('&')
    .map((pair) => {
      const eq = pair.indexOf('=');
      if (eq < 0) return pair;
      const rawName = pair.slice(0, eq);
      let name = rawName;
      try {
        name = decodeURIComponent(rawName.replace(/\+/g, ' '));
      } catch {
        // Malformed escapes: match on the raw name.
      }
      return SENSITIVE_PARAM.test(name) ? `${rawName}=${REDACTED}` : pair;
    })
    .join('&');
}

/**
 * Masks secrets that commonly travel in URLs (reset tokens, OAuth codes, signed-URL signatures) in
 * the query and in a query-like hash. Invalid URLs, and URLs with nothing to redact, are returned
 * unchanged.
 */
export function redactUrl(raw: string): string {
  try {
    if (!raw) return raw;
    const url = new URL(raw);
    let changed = false;
    if (url.search.length > 1) {
      const search = redactPairs(url.search.slice(1));
      if (search !== url.search.slice(1)) {
        url.search = `?${search}`;
        changed = true;
      }
    }
    const hash = url.hash.slice(1);
    const q = hash.indexOf('?');
    const prefix = q >= 0 ? hash.slice(0, q + 1) : '';
    const rest = q >= 0 ? hash.slice(q + 1) : hash;
    if (rest.includes('=')) {
      const redacted = redactPairs(rest);
      if (redacted !== rest) {
        url.hash = `#${prefix}${redacted}`;
        changed = true;
      }
    }
    return changed ? url.href : raw;
  } catch {
    return raw;
  }
}

const clampDimension = (value: number) => Math.min(Math.max(Math.round(value) || 0, 0), 100_000);

function timezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
  } catch {
    return '';
  }
}

/** Snapshot of page context taken at submit time. The email travels in the payload, not here. */
export function collectMetadata(
  win: Window,
  consoleErrors: ConsoleError[],
  user?: IdentifiedUser,
): ClientMetadata {
  const dpr = win.devicePixelRatio > 0 ? Math.min(win.devicePixelRatio, 10) : 1;
  const meta: ClientMetadata = {
    url: redactUrl(win.location.href).slice(0, 2048),
    referrer: redactUrl(win.document.referrer).slice(0, 2048),
    userAgent: win.navigator.userAgent.slice(0, 1024),
    language: (win.navigator.language || '').slice(0, 35),
    timezone: timezone().slice(0, 64),
    viewport: { w: clampDimension(win.innerWidth), h: clampDimension(win.innerHeight) },
    screen: { w: clampDimension(win.screen.width), h: clampDimension(win.screen.height), dpr },
    consoleErrors,
  };
  const id = user?.id?.slice(0, 128);
  const name = user?.name?.slice(0, 128);
  if (id || name) meta.user = { ...(id ? { id } : {}), ...(name ? { name } : {}) };
  return meta;
}
