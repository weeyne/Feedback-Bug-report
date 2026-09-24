import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light', setTheme: vi.fn() }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

import { runTransition, ThemeToggle } from './theme-toggle';

describe('ThemeToggle (SSR path, before mount)', () => {
  it('renders an aria-hidden placeholder of the same size as the real toggle', () => {
    const html = renderToStaticMarkup(<ThemeToggle />);
    expect(html).toContain('aria-hidden');
    expect(html).toContain('h-[30px]');
    expect(html).toContain('w-14');
    // The real button (with role="switch") must not render before mount.
    expect(html).not.toContain('role="switch"');
  });
});

// This test file runs under Vitest's default "node" environment (no jsdom), so
// `window`/`document` are stubbed with minimal fakes sufficient for runTransition.
describe('runTransition', () => {
  let matchMediaMock: (query: string) => { matches: boolean };
  let classes: Set<string>;
  let fakeDocument: Document & { startViewTransition?: (cb: () => void) => unknown };

  beforeEach(() => {
    classes = new Set<string>();
    fakeDocument = {
      documentElement: {
        classList: {
          add: (c: string) => classes.add(c),
          remove: (c: string) => classes.delete(c),
          contains: (c: string) => classes.has(c),
        },
      },
    } as unknown as Document & { startViewTransition?: (cb: () => void) => unknown };
    vi.stubGlobal('document', fakeDocument);
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('matchMedia', (query: string) => matchMediaMock(query));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('applies synchronously and adds no class when reduced motion is requested', () => {
    matchMediaMock = () => ({ matches: true });
    const apply = vi.fn();
    runTransition(apply);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(classes.has('theme-fading')).toBe(false);
  });

  it('calls document.startViewTransition with the apply callback when available', () => {
    matchMediaMock = () => ({ matches: false });
    const apply = vi.fn();
    const startViewTransition = vi.fn((cb: () => void) => cb());
    fakeDocument.startViewTransition =
      startViewTransition as unknown as typeof fakeDocument.startViewTransition;
    runTransition(apply);
    expect(startViewTransition).toHaveBeenCalledWith(apply);
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it('falls back to the theme-fading class, removed after 850ms, when startViewTransition is unavailable', () => {
    vi.useFakeTimers();
    matchMediaMock = () => ({ matches: false });
    const apply = vi.fn();
    runTransition(apply);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(classes.has('theme-fading')).toBe(true);
    vi.advanceTimersByTime(849);
    expect(classes.has('theme-fading')).toBe(true);
    vi.advanceTimersByTime(1);
    expect(classes.has('theme-fading')).toBe(false);
  });
});
