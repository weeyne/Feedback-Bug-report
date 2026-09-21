import { describe, expect, it } from 'vitest';
import { HEX_COLOR_PATTERN, PUBLIC_KEY_PATTERN } from './constants';

describe('PUBLIC_KEY_PATTERN', () => {
  it('accepts pk_ followed by 16 base62 chars', () => {
    expect(PUBLIC_KEY_PATTERN.test('pk_AbCdEfGh12345678')).toBe(true);
  });

  it.each(['pk_short', 'pk_AbCdEfGh123456789', 'sk_AbCdEfGh12345678', 'pk_AbCdEfGh1234567-'])(
    'rejects %s',
    (key) => {
      expect(PUBLIC_KEY_PATTERN.test(key)).toBe(false);
    },
  );
});

describe('HEX_COLOR_PATTERN', () => {
  it('accepts 6-digit hex colors', () => {
    expect(HEX_COLOR_PATTERN.test('#6366f1')).toBe(true);
    expect(HEX_COLOR_PATTERN.test('#ABCDEF')).toBe(true);
  });

  it.each(['6366f1', '#fff', '#6366f1ff', 'red'])('rejects %s', (color) => {
    expect(HEX_COLOR_PATTERN.test(color)).toBe(false);
  });
});
