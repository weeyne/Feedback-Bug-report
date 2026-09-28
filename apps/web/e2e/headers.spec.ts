import { expect, test } from '@playwright/test';

test('pages refuse framing and send the security headers', async ({ request }) => {
  for (const path of ['/', '/login', '/privacy']) {
    const headers = (await request.get(path)).headers();
    expect(headers['x-frame-options'], path).toBe('DENY');
    expect(headers['content-security-policy'], path).toBe(
      "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
    );
    expect(headers['x-content-type-options'], path).toBe('nosniff');
    expect(headers['referrer-policy'], path).toBe('strict-origin-when-cross-origin');
    expect(headers['strict-transport-security'], path).toBe('max-age=31536000');
    expect(headers['x-powered-by'], path).toBeUndefined();
  }
});

test('the demo frames may only be framed by the landing itself', async ({ request }) => {
  const headers = (await request.get('/demo/shop')).headers();
  expect(headers['x-frame-options']).toBeUndefined();
  expect(headers['content-security-policy']).toBe("frame-ancestors 'self'");
  expect(headers['x-content-type-options']).toBe('nosniff');
});

test('an authenticated dashboard page sends the same security headers', async ({ page }) => {
  await page.request.post('/api/e2e-test/login', {
    data: { email: `headers-${Date.now()}@e2e.dev` },
  });
  const headers = (await page.request.get('/app/account')).headers();
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['content-security-policy']).toBe(
    "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
  );
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(headers['strict-transport-security']).toBe('max-age=31536000');
  expect(headers['x-powered-by']).toBeUndefined();
});
