// Must stay free of runtime dependencies: the widget bundle imports this file directly.

const DOMAIN = 'dymcode.dev';

export const BRAND = {
  name: 'Dymcode',
  domain: DOMAIN,
  url: `https://${DOMAIN}`,
  telegramBot: 'DymcodeBot',
} as const;

/** Landing-page link used by the "Powered by" badge; `ref` attributes signups to the host project. */
export function buildBadgeUrl(publicKey: string): string {
  return `${BRAND.url}/?ref=${encodeURIComponent(publicKey)}&utm_source=widget`;
}
