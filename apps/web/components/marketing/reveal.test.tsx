import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { initialShown, Reveal } from './reveal';

const css = readFileSync(fileURLToPath(new URL('../../app/globals.css', import.meta.url)), 'utf8');

/** The body of the first `@media (…) { … }` block whose condition contains `query`. */
function mediaBlock(query: string): string {
  const start = css.indexOf(`@media (${query})`);
  expect(start).toBeGreaterThanOrEqual(0);
  let depth = 0;
  for (let i = css.indexOf('{', start); i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return css.slice(start, i + 1);
  }
  throw new Error('unbalanced CSS');
}

describe('Reveal', () => {
  it('shows content immediately under reduced motion', () => {
    expect(initialShown(true)).toBe(true);
    expect(initialShown(false)).toBe(false);
  });

  it('renders its content in the server markup, hidden by nothing but CSS', () => {
    const html = renderToStaticMarkup(
      <Reveal stagger className="grid">
        <p>Hello</p>
      </Reveal>,
    );
    expect(html).toBe('<div class="reveal reveal-group grid"><p>Hello</p></div>');
  });

  it('hides content only under html.js and only when motion is allowed', () => {
    const allowed = mediaBlock('prefers-reduced-motion: no-preference');
    expect(allowed).toContain('html.js .reveal:not(.reveal-group):not([data-shown])');
    expect(allowed).toContain('html.js .reveal-group:not([data-shown]) .reveal-item');
    expect(allowed).toMatch(/transform: translateY\(16px\)/);
    expect(allowed).toMatch(/opacity 0\.5s cubic-bezier\(0\.4, 0, 0\.2, 1\)/);
    expect(allowed).toContain('calc(var(--i, 0) * 80ms)');
    // Outside that block no rule hides reveal content, so reduced motion and no-JS show everything.
    const rest = css.replace(allowed, '');
    expect(rest).not.toMatch(/\.reveal[^{]*\{[^}]*opacity: 0/);
  });
});
