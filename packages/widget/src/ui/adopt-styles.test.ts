import { afterEach, describe, expect, it, vi } from 'vitest';
import { adoptStyles, applyStyles } from './adopt-styles';

function shadowRoot(): ShadowRoot {
  return document.createElement('div').attachShadow({ mode: 'open' });
}

const cssText = (sheet: CSSStyleSheet) => Array.from(sheet.cssRules, (r) => r.cssText).join('');

describe('adoptStyles', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('adopts one constructable stylesheet per source, in order', () => {
    const shadow = shadowRoot();
    expect(adoptStyles(shadow, ['.a{color:red}', '.b{color:blue}'])).toBe(true);
    expect(shadow.adoptedStyleSheets).toHaveLength(2);
    expect(cssText(shadow.adoptedStyleSheets[0]!)).toContain('.a');
    expect(cssText(shadow.adoptedStyleSheets[1]!)).toContain('.b');
    expect(shadow.querySelectorAll('style')).toHaveLength(0);
  });

  it('returns false and adopts nothing without CSSStyleSheet', () => {
    vi.stubGlobal('CSSStyleSheet', undefined);
    const shadow = shadowRoot();
    expect(adoptStyles(shadow, ['.a{color:red}'])).toBe(false);
    expect(shadow.adoptedStyleSheets).toHaveLength(0);
  });

  it('returns false when a stylesheet cannot be built', () => {
    vi.stubGlobal(
      'CSSStyleSheet',
      class {
        replaceSync() {
          throw new Error('nope');
        }
      },
    );
    expect(adoptStyles(shadowRoot(), ['.a{color:red}'])).toBe(false);
  });
});

describe('applyStyles', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('adopts stylesheets and adds no <style> elements when supported', () => {
    const shadow = shadowRoot();
    applyStyles(shadow, ['.a{color:red}']);
    expect(shadow.adoptedStyleSheets).toHaveLength(1);
    expect(shadow.querySelectorAll('style')).toHaveLength(0);
  });

  it('falls back to <style> elements in source order when unsupported', () => {
    vi.stubGlobal('CSSStyleSheet', undefined);
    const shadow = shadowRoot();
    applyStyles(shadow, ['.a{color:red}', '.b{color:blue}']);
    const styles = Array.from(shadow.querySelectorAll('style'), (s) => s.textContent);
    expect(styles).toEqual(['.a{color:red}', '.b{color:blue}']);
  });
});
