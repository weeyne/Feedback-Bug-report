import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EmptyState } from './empty-state';

describe('EmptyState', () => {
  it('renders the icon, title, body and action link', () => {
    const html = renderToStaticMarkup(
      <EmptyState
        icon={<svg data-icon="inbox" />}
        title="It's quiet here"
        body="Feedback shows up here."
        action={{ href: '/app/p/1/install', label: 'Install the widget' }}
      />,
    );
    expect(html).toContain('data-testid="empty-state"');
    expect(html).toContain('data-icon="inbox"');
    expect(html).toContain('It&#x27;s quiet here');
    expect(html).toContain('Feedback shows up here.');
    expect(html).toMatch(/<a[^>]*href="\/app\/p\/1\/install"[^>]*>Install the widget<\/a>/);
  });

  it('omits the body and action when not given', () => {
    const html = renderToStaticMarkup(<EmptyState icon={null} title="Nothing" />);
    expect(html).toContain('Nothing');
    expect(html).not.toContain('<a');
    expect(html).not.toContain('<p');
  });
});
