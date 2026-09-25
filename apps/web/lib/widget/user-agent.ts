import { UAParser } from 'ua-parser-js';

/**
 * Browser and OS as stored in `feedback.metadata` (and shown in notifications), parsed from the
 * widget's `userAgent`. Missing parts collapse to "Unknown".
 */
export function describeAgent(userAgent: string): { browser: string; os: string } {
  const result = UAParser(userAgent);
  const join = (...parts: Array<string | undefined>) =>
    parts.filter(Boolean).join(' ') || 'Unknown';
  return {
    browser: join(result.browser.name, result.browser.major),
    os: join(result.os.name, result.os.version),
  };
}
