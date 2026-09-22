import { describe, expect, it } from 'vitest';
import { clientIp, corsHeaders, json, preflight } from './http';

describe('http helpers', () => {
  it('reflects the origin in CORS headers', () => {
    expect(corsHeaders('https://host.example')).toEqual({
      'Access-Control-Allow-Origin': 'https://host.example',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type',
      Vary: 'Origin',
    });
    expect(corsHeaders(null)['Access-Control-Allow-Origin']).toBe('*');
  });

  it('answers preflight with 204 and CORS headers', () => {
    const res = preflight(
      new Request('https://x.dev/api', { method: 'OPTIONS', headers: { origin: 'https://a.io' } }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('https://a.io');
  });

  it('builds JSON responses', async () => {
    const res = json({ ok: 1 }, 201, { 'X-Test': 'y' });
    expect(res.status).toBe(201);
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(res.headers.get('x-test')).toBe('y');
    expect(await res.json()).toEqual({ ok: 1 });
  });

  it('takes the first x-forwarded-for address', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }))).toBe(
      '203.0.113.7',
    );
    expect(clientIp(new Headers({ 'x-real-ip': '198.51.100.2' }))).toBe('198.51.100.2');
    expect(clientIp(new Headers())).toBe('unknown');
  });
});
