import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LadybugMark, Wordmark } from './logo';

describe('LadybugMark', () => {
  it('gives every instance its own gradient id', () => {
    const html = renderToStaticMarkup(
      <>
        <LadybugMark />
        <LadybugMark />
      </>,
    );
    const ids = [...html.matchAll(/<radialGradient id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) expect(html).toContain(`url(#${id})`);
  });

  it('is decorative', () => {
    expect(renderToStaticMarkup(<LadybugMark />)).toContain('aria-hidden="true"');
  });
});

describe('Wordmark', () => {
  it('exposes the accessible name Bugping', () => {
    const html = renderToStaticMarkup(<Wordmark />);
    expect(html).toMatch(/aria-label="Bugping"/);
    expect(html).toContain('bugp');
  });
});
