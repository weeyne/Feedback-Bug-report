import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

/** Sent on every response; framing rules differ between the demo frames and everything else. */
const BASE_SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // No includeSubDomains: the production host is a shared *.vercel.app subdomain today.
  { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
];

const config: NextConfig = {
  transpilePackages: ['@bugping/shared', '@bugping/widget'],
  serverExternalPackages: ['@electric-sql/pglite'],
  poweredByHeader: false,
  // `pnpm typecheck` (tsc) is the type gate; Next's built-in checker may not support TS 7.
  typescript: { ignoreBuildErrors: true },
  async headers() {
    return [
      {
        // Every page except the landing demo's frames: never framed by another site (clickjacking).
        source: '/:path((?!demo/).*)',
        headers: [
          ...BASE_SECURITY_HEADERS,
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
          },
        ],
      },
      {
        // The landing demo's store and dashboard: only the landing itself (same origin) may frame
        // them, so nobody can present them inside another site.
        source: '/demo/:path*',
        headers: [
          ...BASE_SECURITY_HEADERS,
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
        ],
      },
      {
        source: '/w/widget.js',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=300, s-maxage=3600' },
          { key: 'Access-Control-Allow-Origin', value: '*' },
        ],
      },
      {
        // Loaded with import() from host pages: module fetches are CORS requests.
        source: '/w/screenshot.js',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
          { key: 'Access-Control-Allow-Origin', value: '*' },
        ],
      },
      {
        // The annotation editor chunk: also loaded with a cross-origin import().
        source: '/w/annotate.js',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
          { key: 'Access-Control-Allow-Origin', value: '*' },
        ],
      },
    ];
  },
};

export default withNextIntl(config);
