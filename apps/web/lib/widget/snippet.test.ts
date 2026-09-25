import { describe, expect, it } from 'vitest';
import { installSnippet, widgetSrc } from './snippet';

describe('install snippet', () => {
  it('builds the async script tag for a project key', () => {
    expect(widgetSrc('https://bugping.app')).toBe('https://bugping.app/w/widget.js');
    expect(installSnippet('https://bugping.app', 'pk_your_project_key')).toBe(
      '<script async src="https://bugping.app/w/widget.js" data-project-id="pk_your_project_key"></script>',
    );
  });
});
