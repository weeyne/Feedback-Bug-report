import { describe, expect, it } from 'vitest';
import { formatTelegram } from '@/lib/notify/format';
import { describeAgent } from '@/lib/widget/user-agent';
import {
  buildDemoMessage,
  demoCaption,
  demoDashboardUrl,
  DEMO_FEEDBACK_ID,
  DEMO_PROJECT_ID,
  fixtureReport,
} from './demo-report';
import { DEMO_CONSOLE_ERROR, DEMO_TEXT } from './protocol';
import { SubmitPayloadSchema } from '@bugping/shared';

describe('demo report', () => {
  it('builds the notification the real pipeline would build', () => {
    const payload = fixtureReport('en');
    const message = buildDemoMessage({
      payload,
      dashboardUrl: 'https://bugping.app/app/p/x/feedback?f=y',
      describe: describeAgent,
    });
    expect(message).toEqual({
      kind: 'feedback',
      projectName: 'Nova Shop',
      type: 'bug',
      message: DEMO_TEXT.en,
      email: null,
      metadata: { ...payload.metadata, browser: 'Chrome 140', os: 'macOS 10.15.7' },
      dashboardUrl: 'https://bugping.app/app/p/x/feedback?f=y',
      screenshot: null,
    });
  });

  it('keeps an email from the payload', () => {
    const message = buildDemoMessage({
      payload: { ...fixtureReport('en'), email: 'ann@example.com' },
      describe: describeAgent,
    });
    expect(message.email).toBe('ann@example.com');
  });

  it('links to the dashboard with the same shape as real notifications', () => {
    expect(demoDashboardUrl('https://bugping.app')).toBe(
      `https://bugping.app/app/p/${DEMO_PROJECT_ID}/feedback?f=${DEMO_FEEDBACK_ID}`,
    );
  });

  it('captions with the real formatTelegram output', () => {
    for (const locale of ['en', 'ru'] as const) {
      const message = buildDemoMessage({
        payload: fixtureReport(locale),
        describe: describeAgent,
      });
      const caption = demoCaption(message);
      expect(caption).toBe(formatTelegram(message).full);
      expect(caption).toContain('🐞 <b>Bug</b> · Nova Shop');
      expect(caption).toContain(DEMO_TEXT[locale]);
      expect(caption).toContain('Chrome 140 · macOS 10.15.7 · 1280×720');
      expect(caption).toContain(`<code>${DEMO_CONSOLE_ERROR}</code>`);
      // Short enough to travel as a photo caption, like the real bot sends it.
      expect(caption.length).toBeLessThanOrEqual(1024);
    }
  });

  it('ships fixtures that pass the real submit schema', () => {
    for (const locale of ['en', 'ru'] as const) {
      expect(SubmitPayloadSchema.safeParse(fixtureReport(locale)).success).toBe(true);
      expect(fixtureReport(locale).metadata.url).toMatch(/\/demo\/shop$/);
    }
    expect(fixtureReport('en', 'https://shop.test').metadata.url).toBe(
      'https://shop.test/demo/shop',
    );
  });
});
