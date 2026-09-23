import { describe, expect, it } from 'vitest';
import { WidgetConfigSchema } from './config';

const valid = {
  primaryColor: '#6366f1',
  triggerText: 'Feedback',
  position: 'bottom-right',
  showBadge: true,
  customCss: null,
  badgeUrl: 'https://bugping.app/?ref=pk_AbCdEfGh12345678&utm_source=widget',
  locale: 'auto',
};

const parse = (overrides: Record<string, unknown>) =>
  WidgetConfigSchema.safeParse({ ...valid, ...overrides });

describe('WidgetConfigSchema', () => {
  it('accepts a valid config', () => {
    expect(WidgetConfigSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts custom css', () => {
    expect(parse({ customCss: '.trigger { border-radius: 0; }' }).success).toBe(true);
  });

  it('rejects an invalid color', () => {
    expect(parse({ primaryColor: 'blue' }).success).toBe(false);
  });

  it('rejects an unknown position', () => {
    expect(parse({ position: 'top-left' }).success).toBe(false);
  });

  it('rejects empty or too long trigger text', () => {
    expect(parse({ triggerText: '' }).success).toBe(false);
    expect(parse({ triggerText: 'x'.repeat(41) }).success).toBe(false);
  });

  it('rejects custom css over the size limit', () => {
    expect(parse({ customCss: 'a'.repeat(10_241) }).success).toBe(false);
  });

  it('accepts every supported locale', () => {
    for (const locale of ['auto', 'en', 'ru', 'uk', 'es']) {
      expect(parse({ locale }).success).toBe(true);
    }
  });

  it('rejects an unsupported locale', () => {
    expect(parse({ locale: 'de' }).success).toBe(false);
  });

  it('requires a locale', () => {
    const { locale: _, ...withoutLocale } = valid;
    expect(WidgetConfigSchema.safeParse(withoutLocale).success).toBe(false);
  });
});
