import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
  useFormatter: () => ({ dateTime: (date: Date) => date.toISOString().slice(0, 10) }),
}));

import { FeedbackChart, type ChartDay } from './feedback-chart';

function makeSeries(fill: (i: number) => Omit<ChartDay, 'day'>): ChartDay[] {
  return Array.from({ length: 30 }, (_, i) => ({
    day: new Date(Date.UTC(2026, 7, 26 + i)).toISOString().slice(0, 10),
    ...fill(i),
  }));
}

/** Parses each column (a `data-day` element) into its three segment heights in px. */
function columns(html: string): number[][] {
  const parts = html.split('data-day="').slice(1);
  return parts.map((part) => {
    const end = part.indexOf('</div></div>');
    const body = part.slice(0, end === -1 ? undefined : end);
    return [...body.matchAll(/height:([\d.]+)px/g)].map((m) => Number(m[1]));
  });
}

describe('FeedbackChart', () => {
  it('renders 30 columns scaled relative to the busiest day', () => {
    const series = makeSeries((i) =>
      i === 10
        ? { bug: 3, idea: 2, general: 1 } // busiest: 6
        : i === 20
          ? { bug: 3, idea: 0, general: 0 } // half of the busiest
          : { bug: 0, idea: 0, general: 0 },
    );
    const html = renderToStaticMarkup(<FeedbackChart series={series} />);
    expect(html).toContain('data-testid="overview-chart"');
    const cols = columns(html);
    expect(cols).toHaveLength(30);
    for (const col of cols) expect(col).toHaveLength(3);

    const total = (col: number[]) => col.reduce((sum, h) => sum + h, 0);
    expect(total(cols[10]!)).toBeCloseTo(120);
    expect(cols[10]).toEqual([60, 40, 20]);
    expect(total(cols[20]!)).toBeCloseTo(60);
    expect(total(cols[0]!)).toBe(0);
    expect(html).not.toContain('chartEmpty');
  });

  it('puts the per-day breakdown into each column title', () => {
    const series = makeSeries((i) => ({ bug: i === 0 ? 2 : 0, idea: 1, general: 0 }));
    const html = renderToStaticMarkup(<FeedbackChart series={series} />);
    expect(html).toContain(
      'chartDayTitle:{&quot;day&quot;:&quot;2026-08-26&quot;,&quot;bug&quot;:2,&quot;idea&quot;:1,&quot;general&quot;:0}',
    );
  });

  it('shows the empty text instead of bars when every day is zero', () => {
    const series = makeSeries(() => ({ bug: 0, idea: 0, general: 0 }));
    const html = renderToStaticMarkup(<FeedbackChart series={series} />);
    expect(html).toContain('data-testid="overview-chart"');
    expect(html).toContain('chartEmpty');
    expect(columns(html)).toHaveLength(0);
  });
});
