import { describe, expect, it } from 'vitest';
import { sampleMessage } from '@/test/notify-fixtures';
import { escapeHtml, escapeHtmlLimited, formatTelegram } from './format';

describe('format', () => {
  it('escapes HTML special characters', () => {
    expect(escapeHtml(`<a href="x">&</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
  });

  it('builds an escaped Telegram message with context and a dashboard link', () => {
    const { full, short } = formatTelegram(sampleMessage());
    expect(full).toContain('🐞 <b>Bug</b> · Acme &lt;Shop&gt;');
    expect(full).toContain('Checkout &lt;b&gt;fails&lt;/b&gt; &amp; nothing happens');
    expect(full).toContain('ann@example.com');
    expect(full).toContain('https://host.example/checkout?plan=pro');
    expect(full).toContain('Chrome 129 · Windows 10 · 1280×720 (screen 1920×1080 @2x)');
    expect(full).toContain('<code>TypeError: x is undefined</code>');
    expect(full).toContain(
      '<a href="https://dymcode.dev/projects/p1/feedback?f=f1">Open in dashboard</a>',
    );
    expect(short).toContain('🐞 <b>Bug</b> · Acme &lt;Shop&gt;');
    expect(short).toContain('Open in dashboard');
    expect(short.length).toBeLessThan(400);
  });

  it('keeps the full message within Telegram limits', () => {
    const { full } = formatTelegram(sampleMessage({ message: 'x'.repeat(5000) }));
    expect(full.length).toBeLessThanOrEqual(4096);
  });

  it('handles escape-heavy content without breaking the 4096 limit', () => {
    const heavyHtml = '<>&"'.repeat(750); // 3000 chars of repeating HTML special chars
    const errors = [
      { message: '<&>'.repeat(167), at: 1 }, // ~500 chars
      { message: '<&>'.repeat(167), at: 2 },
      { message: '<&>'.repeat(167), at: 3 },
    ];
    const { full } = formatTelegram(
      sampleMessage({
        message: heavyHtml,
        metadata: { ...sampleMessage().metadata, consoleErrors: errors },
      }),
    );
    expect(full.length).toBeLessThanOrEqual(4096);
    // Verify no broken HTML entities (& not followed by valid entity)
    expect(full).not.toMatch(/&(?!amp;|lt;|gt;|quot;|nbsp;)/);
  });

  it('truncates escape-heavy messages before exceeding caption limit', () => {
    const heavyHtml = '<>&"'.repeat(375); // 1500 chars of repeating HTML special chars
    const { full, short } = formatTelegram(sampleMessage({ message: heavyHtml }));
    // When full > 1024, short should be used as caption in telegram notifier
    expect(full.length).toBeGreaterThan(1024);
    expect(short.length).toBeLessThanOrEqual(1024);
    expect(full.length).toBeLessThanOrEqual(4096);
  });

  it('never splits HTML entities in escapeHtmlLimited', () => {
    // 601 '&' chars → 601 * 5 = 3005 escaped chars, exceeds 3000 budget
    const result1 = escapeHtmlLimited('&'.repeat(601), 3000);
    expect(result1.length).toBeLessThanOrEqual(3000);
    expect(result1.endsWith('…')).toBe(true);
    expect(result1).not.toMatch(/&(?!amp;|lt;|gt;|quot;)/);

    // 41 '&' chars → 41 * 5 = 205 escaped chars, exceeds 200 budget
    const result2 = escapeHtmlLimited('&'.repeat(41), 200);
    expect(result2.length).toBeLessThanOrEqual(200);
    expect(result2.endsWith('…')).toBe(true);
    expect(result2).not.toMatch(/&(?!amp;|lt;|gt;|quot;)/);
  });

  it('keeps email when shrinking Telegram message for final limits', () => {
    const heavyMessage = '&'.repeat(2720); // Large escape-heavy message
    const longEmail = 'very.long.email.address.with.many.characters@subdomain.example.com';
    const heavyErrors = [
      { message: '<&>'.repeat(167), at: 1 },
      { message: '<&>'.repeat(167), at: 2 },
      { message: '<&>'.repeat(167), at: 3 },
    ];
    const { full } = formatTelegram(
      sampleMessage({
        message: heavyMessage,
        email: longEmail,
        metadata: { ...sampleMessage().metadata, consoleErrors: heavyErrors },
      }),
    );
    expect(full.length).toBeLessThanOrEqual(4096);
    expect(full).toContain(longEmail);
    expect(full).not.toMatch(/&(?!amp;|lt;|gt;|quot;|nbsp;)/);
  });
});
