import { describe, expect, it } from 'vitest';
import { BRAND, buildBadgeUrl } from './brand';

describe('buildBadgeUrl', () => {
  it('links to the landing page with ref and utm_source', () => {
    expect(buildBadgeUrl('pk_AbCdEfGh12345678')).toBe(
      'https://dymcode.dev/?ref=pk_AbCdEfGh12345678&utm_source=widget',
    );
  });

  it('uses the given base URL without a trailing slash', () => {
    expect(buildBadgeUrl('pk_AbCdEfGh12345678', 'https://dymcode.vercel.app/')).toBe(
      'https://dymcode.vercel.app/?ref=pk_AbCdEfGh12345678&utm_source=widget',
    );
  });

  it('encodes unexpected characters', () => {
    expect(buildBadgeUrl('a&b')).toBe('https://dymcode.dev/?ref=a%26b&utm_source=widget');
  });
});

describe('BRAND', () => {
  it('derives url from domain', () => {
    expect(BRAND.url).toBe(`https://${BRAND.domain}`);
  });
});
