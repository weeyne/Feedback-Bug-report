import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HeaderShell } from './header-shell';

describe('HeaderShell (server render)', () => {
  it('renders the header unscrolled, with its children server-rendered', () => {
    const html = renderToStaticMarkup(
      <HeaderShell>
        <a href="/#features">Features</a>
      </HeaderShell>,
    );
    expect(html).toContain('data-testid="landing-header"');
    expect(html).not.toContain('data-scrolled=');
    expect(html).toContain('<a href="/#features">Features</a>');
  });

  it('keeps the scrolled styles behind data-scrolled and off under reduced motion', () => {
    const html = renderToStaticMarkup(<HeaderShell>x</HeaderShell>);
    expect(html).toContain('data-scrolled:backdrop-blur');
    expect(html).toContain('data-scrolled:bg-background/80');
    expect(html).toContain('motion-reduce:transition-none');
  });
});
