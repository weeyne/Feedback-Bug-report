/** Normalizes user input like "shop.example.com/path" to an origin ("https://shop.example.com"). */
export function normalizeOrigin(input: string): string | null {
  const value = input.trim();
  if (!value || /\s/.test(value)) return null;
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(value);
  let url: URL;
  try {
    url = new URL(hasScheme ? value : `https://${value}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (!url.hostname) return null;
  return url.origin;
}
