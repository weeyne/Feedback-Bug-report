import { describe, expect, it } from 'vitest';
import { describeAgent } from './user-agent';

describe('describeAgent', () => {
  it('reads browser major and OS version from a desktop Chrome UA', () => {
    const ua =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
    expect(describeAgent(ua)).toEqual({ browser: 'Chrome 140', os: 'macOS 10.15.7' });
  });

  it('reads Firefox on Windows', () => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0';
    expect(describeAgent(ua)).toEqual({ browser: 'Firefox 131', os: 'Windows 10' });
  });

  it('falls back to Unknown for an empty UA', () => {
    expect(describeAgent('')).toEqual({ browser: 'Unknown', os: 'Unknown' });
  });
});
