import { describe, expect, it } from 'vitest';
import { safeNext } from './next';

describe('safeNext', () => {
  it('accepts dashboard paths with their query', () => {
    expect(safeNext('/app')).toBe('/app');
    expect(safeNext('/app/billing')).toBe('/app/billing');
    expect(safeNext('/app/p/1/feedback?status=new')).toBe('/app/p/1/feedback?status=new');
    expect(safeNext('/app?x=1')).toBe('/app?x=1');
  });

  it('rejects anything that could leave the dashboard', () => {
    for (const value of [
      undefined,
      null,
      '',
      '/',
      '/login',
      '/apps',
      '//evil.com',
      '/app//evil.com',
      '/\\evil.com',
      '/app/\\evil',
      'https://evil.com/app',
      '/app/\u0000',
      '/app/\n',
      `/app/${'a'.repeat(600)}`,
    ]) {
      expect(safeNext(value), String(value)).toBeNull();
    }
  });
});
