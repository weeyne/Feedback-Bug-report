import { ClientMetadataSchema } from '@bugping/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { collectMetadata, redactUrl } from './metadata';

describe('collectMetadata', () => {
  it('collects page context in the shared contract shape', () => {
    const meta = collectMetadata(window, [{ message: 'boom', at: 1 }]);
    expect(meta.url).toBe('https://host.example/pricing?plan=pro');
    expect(meta.consoleErrors).toEqual([{ message: 'boom', at: 1 }]);
    expect(meta.user).toBeUndefined();
    expect(ClientMetadataSchema.safeParse(meta).success).toBe(true);
  });

  it('includes identified id and name but never the email', () => {
    const meta = collectMetadata(window, [], { email: 'a@b.co', id: 'u_1', name: 'Ann' });
    expect(meta.user).toEqual({ id: 'u_1', name: 'Ann' });
    expect(ClientMetadataSchema.safeParse(meta).success).toBe(true);
  });

  it('omits user when only an email was identified', () => {
    expect(collectMetadata(window, [], { email: 'a@b.co' }).user).toBeUndefined();
  });

  it('truncates identified fields to 128 chars', () => {
    const meta = collectMetadata(window, [], { id: 'i'.repeat(200) });
    expect(meta.user?.id).toHaveLength(128);
  });
});

describe('redactUrl', () => {
  it('redacts sensitive query parameter values, case-insensitively', () => {
    expect(
      redactUrl('https://app.example/cb?code=abc&state=s1&Access_Token=t0k&plan=pro&SIG=x'),
    ).toBe(
      'https://app.example/cb?code=[redacted]&state=s1&Access_Token=[redacted]&plan=pro&SIG=[redacted]',
    );
  });

  it('covers every sensitive name', () => {
    const names = [
      'token',
      'access_token',
      'refresh_token',
      'id_token',
      'code',
      'key',
      'secret',
      'password',
      'pass',
      'auth',
      'session',
      'signature',
      'sig',
    ];
    for (const name of names) {
      expect(redactUrl(`https://a.example/?${name}=v`)).toBe(
        `https://a.example/?${name}=[redacted]`,
      );
    }
  });

  it('does not redact names that merely contain a sensitive word', () => {
    const url = 'https://a.example/?keyword=shoes&passport_page=2&zipcode=1';
    expect(redactUrl(url)).toBe(url);
  });

  it('redacts key=value pairs inside a query-like hash', () => {
    expect(redactUrl('https://a.example/#access_token=abc&token_type=bearer')).toBe(
      'https://a.example/#access_token=[redacted]&token_type=bearer',
    );
    expect(redactUrl('https://a.example/app#/callback?code=xyz&next=%2Fhome')).toBe(
      'https://a.example/app#/callback?code=[redacted]&next=%2Fhome',
    );
  });

  it('leaves URLs without sensitive data untouched', () => {
    expect(redactUrl('https://a.example/pricing?plan=pro#faq')).toBe(
      'https://a.example/pricing?plan=pro#faq',
    );
    expect(redactUrl('')).toBe('');
  });

  it('passes invalid URLs through unchanged', () => {
    expect(redactUrl('not a url ?token=abc')).toBe('not a url ?token=abc');
  });
});

describe('collectMetadata URL redaction', () => {
  const originalHref = window.location.href;
  afterEach(() => {
    window.history.replaceState(null, '', originalHref);
    Reflect.deleteProperty(document, 'referrer');
  });

  it('redacts url and referrer and still truncates', () => {
    window.history.replaceState(null, '', '/reset?token=s3cr3t&step=2');
    Object.defineProperty(document, 'referrer', {
      configurable: true,
      value: `https://idp.example/authorize?code=c0de&pad=${'p'.repeat(3000)}`,
    });
    const meta = collectMetadata(window, []);
    expect(meta.url).toBe('https://host.example/reset?token=[redacted]&step=2');
    expect(meta.referrer).toHaveLength(2048);
    expect(meta.referrer).toContain('code=[redacted]');
    expect(meta.referrer).not.toContain('c0de');
  });

  it('truncates an invalid referrer without touching it', () => {
    Object.defineProperty(document, 'referrer', {
      configurable: true,
      value: `::bad::?token=${'x'.repeat(3000)}`,
    });
    expect(collectMetadata(window, []).referrer).toBe(
      `::bad::?token=${'x'.repeat(3000)}`.slice(0, 2048),
    );
  });
});
