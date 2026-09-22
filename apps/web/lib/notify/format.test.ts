import { describe, expect, it } from 'vitest';
import { sampleMessage } from '@/test/notify-fixtures';
import { escapeHtml, formatTelegram } from './format';

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
});
