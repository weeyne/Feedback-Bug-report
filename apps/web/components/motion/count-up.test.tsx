import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CountUp } from './count-up';

const render = (node: ReactNode, locale = 'en') =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={{}} timeZone="UTC">
      {node}
    </NextIntlClientProvider>,
  );

describe('CountUp (server render)', () => {
  it('starts the animated number at 0 and keeps the real value in sr-only text', () => {
    const html = render(<CountUp value={42} />);
    expect(html).toContain('data-value="42"');
    expect(html).toMatch(/<span aria-hidden="true"[^>]*>0<\/span>/);
    expect(html).toMatch(/<span class="sr-only[^"]*">42<\/span>/);
  });

  it('shows the real value directly under reduced motion via CSS', () => {
    const html = render(<CountUp value={7} />);
    expect(html).toMatch(/aria-hidden="true" class="[^"]*motion-reduce:hidden/);
    expect(html).toContain('motion-reduce:not-sr-only');
  });

  it('formats the value with the next-intl locale, not the runtime default', () => {
    expect(render(<CountUp value={12345} />, 'en')).toMatch(/sr-only[^"]*">12,345<\/span>/);
    expect(render(<CountUp value={12345} />, 'ru')).toMatch(/sr-only[^"]*">12 345<\/span>/);
    expect(render(<CountUp value={12345} />)).toContain('data-value="12345"');
  });
});
