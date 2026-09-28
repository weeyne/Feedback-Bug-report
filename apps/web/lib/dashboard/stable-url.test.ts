import { describe, expect, it } from 'vitest';
import { stableUrl } from './stable-url';

const KEEP = 4 * 60_000;

describe('stableUrl', () => {
  it('takes the incoming url when there is no current one', () => {
    expect(stableUrl(null, 'b', 500, KEEP)).toEqual({ src: 'b', since: 500 });
  });

  it('keeps the current url within the window', () => {
    const current = { src: 'a', since: 1000 };
    expect(stableUrl(current, 'b', 1000 + KEEP - 1, KEEP)).toBe(current);
  });

  it('switches to the incoming url once the window has passed', () => {
    const current = { src: 'a', since: 1000 };
    expect(stableUrl(current, 'b', 1000 + KEEP, KEEP)).toEqual({ src: 'b', since: 1000 + KEEP });
  });
});
