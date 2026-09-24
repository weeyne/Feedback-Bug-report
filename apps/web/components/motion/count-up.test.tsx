import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CountUp } from './count-up';

describe('CountUp (server render)', () => {
  it('starts the animated number at 0 and keeps the real value in sr-only text', () => {
    const html = renderToStaticMarkup(<CountUp value={42} />);
    expect(html).toContain('data-value="42"');
    expect(html).toMatch(/<span aria-hidden="true"[^>]*>0<\/span>/);
    expect(html).toMatch(/<span class="sr-only[^"]*">42<\/span>/);
  });

  it('shows the real value directly under reduced motion via CSS', () => {
    const html = renderToStaticMarkup(<CountUp value={7} />);
    expect(html).toMatch(/aria-hidden="true" class="[^"]*motion-reduce:hidden/);
    expect(html).toContain('motion-reduce:not-sr-only');
  });
});
