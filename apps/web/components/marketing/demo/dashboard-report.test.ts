import { describe, expect, it } from 'vitest';
import { metaLine } from '@/lib/dashboard/feed-view';
import { describeAgent } from '@/lib/widget/user-agent';
import {
  decodeDemoReport,
  DEMO_REPORT_MAX_CHARS,
  encodeDemoReport,
  toFeedbackDetail,
  trustedReportParam,
  type DemoReport,
} from './dashboard-report';
import { DEMO_FEEDBACK_ID, DEMO_PROJECT_ID, fixtureReport } from './demo-report';

const fixture = (locale: 'en' | 'ru'): DemoReport => {
  const { type, message, metadata } = fixtureReport(locale);
  return { type, message, metadata };
};

const b64 = (text: string) => Buffer.from(text, 'utf8').toString('base64url');

describe('demo dashboard report (?r=)', () => {
  it('round-trips a report, Cyrillic included', () => {
    const report: DemoReport = {
      ...fixture('ru'),
      message: 'Кнопка «Оплатить» не работает 🙁\nвторая строка',
      email: 'anna@example.com',
    };
    const raw = encodeDemoReport(report);
    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeDemoReport(raw, 'en')).toEqual(report);
  });

  it('drops payload fields the dashboard does not show', () => {
    const raw = encodeDemoReport(fixtureReport('en'));
    expect(JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'))).toEqual(fixture('en'));
    expect(decodeDemoReport(raw, 'ru')).toEqual(fixture('en'));
  });

  it('decodes what Node encodes as base64url', () => {
    const raw = b64(JSON.stringify({ ...fixture('en'), message: 'Привет' }));
    expect(decodeDemoReport(raw, 'en').message).toBe('Привет');
  });

  it('falls back to the locale fixture when missing, oversized or invalid', () => {
    const valid = fixture('en');
    const cases: Array<string | undefined> = [
      undefined,
      '',
      'not base64!',
      b64('{not json'),
      b64('"a string"'),
      b64('null'),
      Buffer.from([0xff, 0xfe, 0x00]).toString('base64url'),
      b64(JSON.stringify({ ...valid, type: 'praise' })),
      b64(JSON.stringify({ ...valid, message: '   ' })),
      b64(JSON.stringify({ ...valid, message: 'x'.repeat(5001) })),
      b64(JSON.stringify({ ...valid, email: 'not-an-email' })),
      b64(
        JSON.stringify({ ...valid, metadata: { ...valid.metadata, url: 'javascript:alert(1)' } }),
      ),
      b64(JSON.stringify({ ...valid, metadata: { ...valid.metadata, viewport: undefined } })),
      'A'.repeat(DEMO_REPORT_MAX_CHARS + 1),
    ];
    for (const raw of cases) {
      expect(decodeDemoReport(raw, 'ru'), String(raw).slice(0, 40)).toEqual(fixture('ru'));
    }
  });

  it('rejects an oversized value even when it would be valid', () => {
    // 5000 Cyrillic characters: within MESSAGE_MAX_LENGTH, but 10 KB of UTF-8.
    const big = { ...fixture('en'), message: 'я'.repeat(5000) };
    const raw = encodeDemoReport(big);
    expect(raw.length).toBeGreaterThan(DEMO_REPORT_MAX_CHARS);
    expect(decodeDemoReport(raw, 'en')).toEqual(fixture('en'));
  });

  it('accepts a null email as no email', () => {
    const raw = b64(JSON.stringify({ ...fixture('en'), email: null }));
    expect(decodeDemoReport(raw, 'en')).toEqual(fixture('en'));
  });
});

describe('trustedReportParam', () => {
  const frame = { dest: 'iframe', site: 'same-origin' };

  it('honours ?r= only for a same-origin iframe load', () => {
    expect(trustedReportParam('abc', frame)).toBe('abc');
  });

  it('ignores ?r= for direct visits, cross-site frames and missing headers', () => {
    expect(trustedReportParam('abc', { dest: 'document', site: 'none' })).toBeUndefined();
    expect(trustedReportParam('abc', { dest: 'document', site: 'same-origin' })).toBeUndefined();
    expect(trustedReportParam('abc', { dest: 'iframe', site: 'cross-site' })).toBeUndefined();
    expect(trustedReportParam('abc', { dest: 'iframe', site: 'same-site' })).toBeUndefined();
    expect(trustedReportParam('abc', { dest: null, site: null })).toBeUndefined();
  });

  it('ignores a missing or repeated ?r=', () => {
    expect(trustedReportParam(undefined, frame)).toBeUndefined();
    expect(trustedReportParam(['a', 'b'], frame)).toBeUndefined();
  });
});

describe('toFeedbackDetail', () => {
  const now = new Date('2026-09-24T14:32:05.000Z');

  it('shapes the row and the detail like listFeedback/getFeedback', () => {
    const report: DemoReport = {
      ...fixture('en'),
      metadata: { ...fixture('en').metadata, url: 'https://shop.example.com/checkout?step=2' },
      email: 'ann@example.com',
    };
    const { item, detail } = toFeedbackDetail(report, { now, describe: describeAgent });
    expect(item).toEqual({
      id: DEMO_FEEDBACK_ID,
      type: 'bug',
      message: report.message,
      status: 'new',
      created_at: '2026-09-24T14:32:05.000Z',
      has_screenshot: true,
      page: '/checkout',
      browser: 'Chrome 140',
      email: 'ann@example.com',
    });
    expect(detail).toEqual({
      ...item,
      project_id: DEMO_PROJECT_ID,
      metadata: { ...report.metadata, browser: 'Chrome 140', os: 'macOS 10.15.7' },
    });
    expect(metaLine(item)).toBe('/checkout · Chrome 140 · ann@example.com');
  });

  it('has no email without one and previews 200 characters in the row', () => {
    const message = 'ё'.repeat(150) + '😀'.repeat(100);
    const { item, detail } = toFeedbackDetail(
      { ...fixture('ru'), message },
      { now, describe: describeAgent },
    );
    expect(item.email).toBeNull();
    expect(detail.email).toBeNull();
    expect([...item.message]).toHaveLength(200);
    expect(item.message.endsWith('😀')).toBe(true);
    expect(detail.message).toBe(message);
    expect(detail.metadata.consoleErrors).toEqual(fixtureReport('ru').metadata.consoleErrors);
    // The fixture's page is the fictional store's checkout.
    expect(item.page).toBe('/checkout');
  });
});
