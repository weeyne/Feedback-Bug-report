import { expect, test } from '@playwright/test';

test('pages refuse framing and send the security headers', async ({ request }) => {
  const headers = (await request.get('/')).headers();
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['content-security-policy']).toBe(
    "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
  );
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(headers['strict-transport-security']).toBe('max-age=31536000');
  expect(headers['x-powered-by']).toBeUndefined();
});

test('the demo frames may only be framed by the landing itself', async ({ request }) => {
  const headers = (await request.get('/demo/shop')).headers();
  expect(headers['x-frame-options']).toBeUndefined();
  expect(headers['content-security-policy']).toBe("frame-ancestors 'self'");
  expect(headers['x-content-type-options']).toBe('nosniff');
});

// Recorded, not asserted: the baseline for the caching work of wave 4d.
test('record the cache-control of the landing and the demo shop', async ({ request }) => {
  for (const path of ['/', '/demo/shop']) {
    const value = (await request.get(path)).headers()['cache-control'] ?? '(none)';
    test.info().annotations.push({ type: `cache-control ${path}`, description: value });
    console.log(`cache-control ${path}: ${value}`);
  }
});
