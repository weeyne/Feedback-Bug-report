import { describe, expect, it } from 'vitest';
import { originAllowed, parseOrigin, siteKey } from './origins';

describe('siteKey', () => {
  it('drops one leading www., the scheme and default ports', () => {
    expect(siteKey('https://www.Example.com')).toBe('example.com');
    expect(siteKey('http://example.com:80')).toBe('example.com');
    expect(siteKey('https://example.com:8443')).toBe('example.com:8443');
    expect(siteKey('https://www.www.example.com')).toBe('www.example.com');
  });

  it('rejects non-http(s) and unparsable values', () => {
    expect(siteKey('null')).toBeNull();
    expect(siteKey('file:///tmp/x.html')).toBeNull();
    expect(siteKey('not a url')).toBeNull();
  });
});

describe('parseOrigin', () => {
  it('returns the origin of http(s) URLs only', () => {
    expect(parseOrigin('https://shop.example/path?q=1')).toBe('https://shop.example');
    expect(parseOrigin('http://localhost:3000')).toBe('http://localhost:3000');
    expect(parseOrigin('null')).toBeNull();
    expect(parseOrigin(null)).toBeNull();
    expect(parseOrigin('chrome-extension://abc')).toBeNull();
  });
});

describe('originAllowed', () => {
  const list = ['https://example.com', 'http://localhost:3000'];

  it('allows everything when the list is empty', () => {
    expect(originAllowed('https://anything.example', [])).toBe(true);
    expect(originAllowed(null, [])).toBe(true);
  });

  it('treats apex and www, http and https as one site', () => {
    expect(originAllowed('https://example.com', list)).toBe(true);
    expect(originAllowed('https://www.example.com', list)).toBe(true);
    expect(originAllowed('http://example.com', list)).toBe(true);
    expect(originAllowed('https://example.com', ['https://www.example.com'])).toBe(true);
  });

  it('keeps ports and other subdomains distinct', () => {
    expect(originAllowed('http://localhost:3000', list)).toBe(true);
    expect(originAllowed('http://localhost:4000', list)).toBe(false);
    expect(originAllowed('https://shop.example.com', list)).toBe(false);
    expect(originAllowed('https://example.com.evil.io', list)).toBe(false);
  });

  it('refuses a missing, "null" or unparsable origin when a list is set', () => {
    expect(originAllowed(null, list)).toBe(false);
    expect(originAllowed('null', list)).toBe(false);
    expect(originAllowed('garbage', list)).toBe(false);
  });
});
