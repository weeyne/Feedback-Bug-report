import { describe, expect, it } from 'vitest';
import { validTimeZone } from './time-zone';

describe('validTimeZone', () => {
  it.each(['Europe/Kyiv', 'America/New_York', 'UTC'])('accepts %s', (zone) => {
    expect(validTimeZone(zone)).toBe(zone);
  });

  it.each([undefined, '', 'Mars/Base', 'a'.repeat(100)])('rejects %j', (zone) => {
    expect(validTimeZone(zone)).toBeUndefined();
  });
});
