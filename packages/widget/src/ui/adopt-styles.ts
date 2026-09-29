import { h } from './h';

/**
 * Constructable stylesheets are not `<style>` elements, so a strict `style-src` CSP on the host
 * does not block them. Returns false (nothing adopted) when unsupported, so callers can fall back.
 */
export function adoptStyles(shadow: ShadowRoot, sources: string[]): boolean {
  try {
    if (typeof CSSStyleSheet !== 'function' || !('adoptedStyleSheets' in shadow)) return false;
    shadow.adoptedStyleSheets = sources.map((css) => {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
      return sheet;
    });
    return true;
  } catch {
    return false;
  }
}

/** Styles a shadow root: adopted stylesheets where supported, otherwise `<style>` elements in order. */
export function applyStyles(shadow: ShadowRoot, sources: string[]): void {
  if (adoptStyles(shadow, sources)) return;
  for (const css of sources) shadow.append(h('style', {}, css));
}
