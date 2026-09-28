import { describe, expect, it } from 'vitest';
import { clientIp, corsHeaders, json, preflight, rateLimitIdentity } from './http';

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

  it('reads only the trusted header when one is configured', () => {
    const headers = new Headers({
      'cf-connecting-ip': '198.51.100.20',
      'x-forwarded-for': '203.0.113.7',
    });
    expect(clientIp(headers, 'cf-connecting-ip')).toBe('198.51.100.20');
    expect(clientIp(new Headers({ 'x-forwarded-for': '203.0.113.7' }), 'cf-connecting-ip')).toBe(
      'unknown',
    );
    expect(clientIp(new Headers({ 'x-client-ip': ' 192.0.2.1, 10.0.0.1' }), 'x-client-ip')).toBe(
      '192.0.2.1',
    );
  });
});

describe('rateLimitIdentity', () => {
  it('keeps IPv4, unwraps IPv4-mapped IPv6 and reduces IPv6 to its /64', () => {
    expect(rateLimitIdentity('203.0.113.7')).toBe('203.0.113.7');
    expect(rateLimitIdentity('::FFFF:203.0.113.7')).toBe('203.0.113.7');
    expect(rateLimitIdentity('2001:0DB8:0000:0001:aaaa:bbbb:cccc:dddd')).toBe('2001:db8:0:1::/64');
    expect(rateLimitIdentity('2001:db8::1')).toBe('2001:db8:0:0::/64');
    expect(rateLimitIdentity('[2001:db8:0:1::5]')).toBe('2001:db8:0:1::/64');
    expect(rateLimitIdentity('fe80::1%eth0')).toBe('fe80:0:0:0::/64');
    expect(rateLimitIdentity('unknown')).toBe('unknown');
  });
});
