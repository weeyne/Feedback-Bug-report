// Must stay free of runtime dependencies: the widget bundle imports this file directly.

const DOMAIN = 'dymcode.dev';

export const BRAND = {
  name: 'Dymcode',
  domain: DOMAIN,
  url: `https://${DOMAIN}`,
  telegramBot: 'DymcodeBot',
} as const;

/**
 * Landing-page link used by the "Powered by" badge; `ref` attributes signups to the host project.
 * `baseUrl` is the deployed app origin (NEXT_PUBLIC_APP_URL); BRAND.url is only a fallback.
 */
export function buildBadgeUrl(publicKey: string, baseUrl: string = BRAND.url): string {
  return `${baseUrl.replace(/\/+$/, '')}/?ref=${encodeURIComponent(publicKey)}&utm_source=widget`;
}
