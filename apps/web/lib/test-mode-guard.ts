/**
 * True when the E2E test mode is on: `BUGPING_TEST_MODE=1` and never in a production build. Every
 * test-only entry point (E2E routes, the fake session cookie, the login shortcut) checks this one
 * rule. Reads `process.env` directly and imports nothing, so the proxy and the E2E host page can use
 * it without pulling in `lib/env` or PGlite.
 */
export function testModeEnabled(): boolean {
  return process.env.BUGPING_TEST_MODE === '1' && process.env.NODE_ENV !== 'production';
}
