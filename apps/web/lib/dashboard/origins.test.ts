import { describe, expect, it } from 'vitest';
import { normalizeOrigin } from './origins';

describe('normalizeOrigin', () => {
  it.each([
    ['example.com', 'https://example.com'],
    ['https://shop.example.com/path?q=1', 'https://shop.example.com'],
    ['http://localhost:3000', 'http://localhost:3000'],
    ['  HTTPS://Example.COM  ', 'https://example.com'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeOrigin(input)).toBe(expected);
  });

  it.each(['', 'ftp://example.com', 'javascript:alert(1)', 'http://', 'exa mple.com'])(
    'rejects %s',
    (input) => {
      expect(normalizeOrigin(input)).toBeNull();
    },
  );
});
