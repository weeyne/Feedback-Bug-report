export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Keep in sync with E2E_PROJECT_KEY in lib/test-mode.ts (not imported: that module pulls in PGlite).
const HOST_PAGE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Bugping E2E host</title>
  </head>
  <body style="margin: 0; background: #fff">
    <h1 style="margin: 40px; font: 20px sans-serif">E2E host page</h1>
    <script>
      const key = new URLSearchParams(location.search).get('key') || 'pk_E2eE2eE2eE2e1234';
      const script = document.createElement('script');
      script.async = true;
      script.src = '/w/widget.js';
      script.dataset.projectId = key;
      document.head.append(script);
    </script>
  </body>
</html>
`;

/** E2E only: a host page that embeds the widget. 404 unless test mode is on (never in production). */
export function GET(): Response {
  if (process.env.BUGPING_TEST_MODE !== '1' || process.env.NODE_ENV === 'production') {
    return new Response('Not found', { status: 404 });
  }
  return new Response(HOST_PAGE, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}
