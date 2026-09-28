/** Where to go after signing in; set when an anonymous visitor is sent from /app/* to /login. */
export const NEXT_COOKIE = 'bp_next';
export const NEXT_COOKIE_MAX_AGE = 600;

/** A post-sign-in target: dashboard paths only, never another host or a protocol-relative URL. */
export function safeNext(value: string | null | undefined): string | null {
  if (!value || value.length > 512) return null;
  if (/[\u0000-\u001f\u007f\\]/.test(value) || value.includes('//')) return null;
  if (value === '/app' || value.startsWith('/app/') || value.startsWith('/app?')) return value;
  return null;
}
