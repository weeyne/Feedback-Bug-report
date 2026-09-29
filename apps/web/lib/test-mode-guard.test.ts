import { afterEach, describe, expect, it, vi } from 'vitest';
import { testModeEnabled } from './test-mode-guard';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('testModeEnabled', () => {
  it.each([
    ['1', 'development', true],
    ['1', 'test', true],
    ['1', 'production', false],
    ['0', 'development', false],
    ['', 'development', false],
    ['true', 'development', false],
  ])('BUGPING_TEST_MODE=%j NODE_ENV=%j → %s', (mode, nodeEnv, expected) => {
    vi.stubEnv('BUGPING_TEST_MODE', mode);
    vi.stubEnv('NODE_ENV', nodeEnv);
    expect(testModeEnabled()).toBe(expected);
  });
});
