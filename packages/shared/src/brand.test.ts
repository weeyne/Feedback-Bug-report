import { describe, expect, it } from 'vitest';
import { BRAND, buildBadgeUrl } from './brand';

describe('buildBadgeUrl', () => {
  it('links to the landing page with ref and utm_source', () => {
    expect(buildBadgeUrl('pk_AbCdEfGh12345678')).toBe(
      'https://bugping.app/?ref=pk_AbCdEfGh12345678&utm_source=widget',
    );
  });

  it('uses the given base URL without a trailing slash', () => {
    expect(buildBadgeUrl('pk_AbCdEfGh12345678', 'https://bugping.vercel.app/')).toBe(
      'https://bugping.vercel.app/?ref=pk_AbCdEfGh12345678&utm_source=widget',
    );
  });

  it('encodes unexpected characters', () => {
    expect(buildBadgeUrl('a&b')).toBe('https://bugping.app/?ref=a%26b&utm_source=widget');
  });
});

describe('BRAND', () => {
  it('is Bugping and derives url from domain', () => {
    expect(BRAND.name).toBe('Bugping');
    expect(BRAND.url).toBe(`https://${BRAND.domain}`);
    expect(BRAND).not.toHaveProperty('telegramBot');
  });
});
