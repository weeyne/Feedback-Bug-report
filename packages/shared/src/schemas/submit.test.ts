import { describe, expect, it } from 'vitest';
import { SubmitPayloadSchema } from './submit';

const metadata = {
  url: 'https://example.com/pricing',
  referrer: '',
  userAgent: 'Mozilla/5.0',
  language: 'en-US',
  timezone: 'Europe/Kyiv',
  viewport: { w: 1280, h: 720 },
  screen: { w: 1920, h: 1080, dpr: 2 },
  consoleErrors: [
    {
      message: 'TypeError: x is undefined',
      source: 'https://example.com/app.js',
      line: 42,
      at: 1758466800000,
    },
  ],
};

const valid = {
  projectKey: 'pk_AbCdEfGh12345678',
  type: 'bug',
  message: 'Button does nothing',
  metadata,
  openedAt: 1758466800000,
  website: '',
};

const parse = (overrides: Record<string, unknown>) =>
  SubmitPayloadSchema.safeParse({ ...valid, ...overrides });

describe('SubmitPayloadSchema', () => {
  it('accepts a valid payload', () => {
    expect(SubmitPayloadSchema.safeParse(valid).success).toBe(true);
  });

  it('trims the message', () => {
    const result = parse({ message: '  hello  ' });
    expect(result.success && result.data.message).toBe('hello');
  });

  it('rejects a whitespace-only message', () => {
    expect(parse({ message: '   ' }).success).toBe(false);
  });

  it('rejects a message longer than 5000 chars', () => {
    expect(parse({ message: 'a'.repeat(5001) }).success).toBe(false);
  });

  it('rejects an unknown type', () => {
    expect(parse({ type: 'praise' }).success).toBe(false);
  });

  it('rejects a malformed project key', () => {
    expect(parse({ projectKey: 'pk_123' }).success).toBe(false);
  });

  it('treats an empty email as absent', () => {
    const result = parse({ email: '' });
    expect(result.success).toBe(true);
    expect(result.success && result.data.email).toBeUndefined();
  });

  it('rejects an invalid email', () => {
    expect(parse({ email: 'not-an-email' }).success).toBe(false);
  });

  it('defaults the honeypot to an empty string', () => {
    const { website: _, ...withoutHoneypot } = valid;
    const result = SubmitPayloadSchema.safeParse(withoutHoneypot);
    expect(result.success && result.data.website).toBe('');
  });

  it('rejects more than 10 console errors', () => {
    const consoleErrors = Array.from({ length: 11 }, () => metadata.consoleErrors[0]);
    expect(parse({ metadata: { ...metadata, consoleErrors } }).success).toBe(false);
  });

  it('rejects a console error message longer than 500 chars', () => {
    const consoleErrors = [{ message: 'e'.repeat(501), at: 1 }];
    expect(parse({ metadata: { ...metadata, consoleErrors } }).success).toBe(false);
  });

  it('rejects a non-http page url', () => {
    expect(parse({ metadata: { ...metadata, url: 'javascript:alert(1)' } }).success).toBe(false);
  });
});
