import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ladybugDetailedSvg, ladybugSimpleSvg } from './ladybug-svg';
import { LadybugMark, Logo, Wordmark } from './logo';

/**
 * Extracts the geometry-defining attributes (`d`, `cx`, `cy`, `r`, `rx`, `ry`, `transform`)
 * of every `<path>`/`<circle>`/`<ellipse>` element, in document order, from raw SVG markup.
 * Used to detect drift between the JSX `LadybugMark` component and the `ladybugDetailedSvg`
 * string, which duplicate the same illustration in two different renderers.
 */
function extractGeometry(svg: string): string[] {
  const geometryAttrs = ['d', 'cx', 'cy', 'r', 'rx', 'ry', 'transform'] as const;
  const geometry: string[] = [];
  for (const match of svg.matchAll(/<(path|circle|ellipse)\b([^>]*)\/?>/g)) {
    const [, tag, attrs] = match;
    const values = geometryAttrs
      .map((name) => {
        const value = new RegExp(`\\b${name}="([^"]*)"`).exec(attrs ?? '')?.[1];
        return value === undefined ? null : `${name}=${value}`;
      })
      .filter((value): value is string => value !== null);
    geometry.push(`${tag}:${values.join(',')}`);
  }
  return geometry;
}

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

  it('renders the same geometry as ladybugDetailedSvg (drift protection)', () => {
    const fromComponent = extractGeometry(renderToStaticMarkup(<LadybugMark />));
    const fromString = extractGeometry(ladybugDetailedSvg('x'));
    expect(fromComponent.length).toBeGreaterThan(0);
    expect(fromComponent).toEqual(fromString);
  });
});

describe('Wordmark', () => {
  it('exposes the accessible name Bugping', () => {
    const html = renderToStaticMarkup(<Wordmark />);
    expect(html).toMatch(/aria-label="Bugping"/);
    expect(html).toContain('bugp');
  });
});

describe('app/icon.svg', () => {
  it('matches ladybugSimpleSvg exactly (drift protection)', () => {
    const fileUrl = new URL('../../app/icon.svg', import.meta.url);
    const fileContents = readFileSync(fileURLToPath(fileUrl), 'utf8').replace(/\r?\n$/, '');
    expect(fileContents).toBe(ladybugSimpleSvg);
  });
});

describe('Logo', () => {
  it('renders a link when href is given', () => {
    const html = renderToStaticMarkup(<Logo href="/app" />);
    expect(html).toContain('href="/app"');
    expect(html).toMatch(/<a\b/);
  });

  it('renders no link when href is omitted', () => {
    const html = renderToStaticMarkup(<Logo />);
    expect(html).not.toMatch(/<a\b/);
  });
});
