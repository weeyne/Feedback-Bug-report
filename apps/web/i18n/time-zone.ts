export const TIME_ZONE_COOKIE = 'tz';

/** The cookie is user-controlled: accept only a zone Intl knows, of sane length. */
export function validTimeZone(value: string | undefined): string | undefined {
  if (!value || value.length > 64) return undefined;
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return value;
  } catch {
    return undefined;
  }
}
