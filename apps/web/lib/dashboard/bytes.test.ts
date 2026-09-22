import { describe, expect, it } from 'vitest';
import { utf8ByteLength } from './bytes';

describe('utf8ByteLength', () => {
  it('counts UTF-8 bytes, not characters', () => {
    expect(utf8ByteLength('')).toBe(0);
    expect(utf8ByteLength('abc')).toBe(3);
    expect(utf8ByteLength('ж')).toBe(2);
    expect(utf8ByteLength('€')).toBe(3);
    expect(utf8ByteLength('😀')).toBe(4);
  });
});
