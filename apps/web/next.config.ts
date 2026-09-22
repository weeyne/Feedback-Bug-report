import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const config: NextConfig = {
  transpilePackages: ['@dymcode/shared'],
  serverExternalPackages: ['@electric-sql/pglite'],
  // `pnpm typecheck` (tsc) is the type gate; Next's built-in checker may not support TS 7.
  typescript: { ignoreBuildErrors: true },
  async headers() {
    return [
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
    ];
  },
};

export default withNextIntl(config);
