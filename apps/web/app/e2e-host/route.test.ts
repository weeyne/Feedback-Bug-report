import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('GET /e2e-host', () => {
  it('is not served outside test mode', async () => {
    vi.stubEnv('DYMCODE_TEST_MODE', '');
    expect((await GET()).status).toBe(404);
  });

  it('is not served in production even with test mode set', async () => {
    vi.stubEnv('DYMCODE_TEST_MODE', '1');
    vi.stubEnv('NODE_ENV', 'production');
    expect((await GET()).status).toBe(404);
  });

  it('serves the widget host page in test mode', async () => {
    vi.stubEnv('DYMCODE_TEST_MODE', '1');
    vi.stubEnv('NODE_ENV', 'development');
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
    const html = await res.text();
    expect(html).toContain("script.src = '/w/widget.js'");
    expect(html).toContain('pk_E2eE2eE2eE2e1234');
  });
});
