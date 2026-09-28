import { describe, expect, it } from 'vitest';
import { stableUrl } from './stable-url';

const KEEP = 4 * 60_000;

describe('stableUrl', () => {
  it('takes the incoming url when there is no current one', () => {
    expect(stableUrl(null, 'shot.png?t=2', 500, KEEP)).toEqual({ src: 'shot.png?t=2', since: 500 });
  });

  it('keeps the current url within the window', () => {
    const current = { src: 'shot.png?t=1', since: 1000 };
    expect(stableUrl(current, 'shot.png?t=2', 1000 + KEEP - 1, KEEP)).toBe(current);
  });

  it('switches to the incoming url once the window has passed', () => {
    const current = { src: 'shot.png?t=1', since: 1000 };
    expect(stableUrl(current, 'shot.png?t=2', 1000 + KEEP, KEEP)).toEqual({
      src: 'shot.png?t=2',
      since: 1000 + KEEP,
    });
  });

  it('keeps the current url when only the query string differs', () => {
    const current = { src: 'https://x.test/a/shot.png?token=1', since: 1000 };
    expect(stableUrl(current, 'https://x.test/a/shot.png?token=2', 2000, KEEP)).toBe(current);
  });

  it('takes the incoming url for a different path within the window', () => {
    const current = { src: 'https://x.test/a/shot.png?token=1', since: 1000 };
    expect(stableUrl(current, 'https://x.test/b/shot.png?token=1', 2000, KEEP)).toEqual({
      src: 'https://x.test/b/shot.png?token=1',
      since: 2000,
    });
  });
});
