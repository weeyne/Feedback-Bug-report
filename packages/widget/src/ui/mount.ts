import type { WidgetConfig } from '@bugping/shared';
import { HEX_COLOR_PATTERN, type FeedbackType } from '@bugping/shared/constants';
import type { IdentifiedUser } from '../context/metadata';
import { MESSAGES, resolveLocale } from '../i18n';
import { h } from './h';
import { createPanel, type PanelDeps } from './panel';
import styles from './styles.css?inline';
import { createTrigger } from './trigger';

export type { PanelDeps } from './panel';

export interface MountOptions {
  /** Dashboard live preview: renders the UI but never captures or submits. */
  preview?: boolean;
  hideTrigger?: boolean;
  deps?: PanelDeps;
  /** Defaults to `navigator.languages`; used when the config locale is `auto`. */
  languages?: readonly string[];
}

export interface WidgetHandle {
  host: HTMLElement;
  open(type?: FeedbackType): void;
  close(): void;
  isOpen(): boolean;
  identify(user: IdentifiedUser): void;
  destroy(): void;
}

const FALLBACK_ACCENT = '#E0321F';

/**
 * Constructable stylesheets are not `<style>` elements, so a strict `style-src` CSP on the host
 * does not block them. Returns false (nothing adopted) when unsupported, so callers can fall back.
 */
function adoptStyles(shadow: ShadowRoot, sources: string[]): boolean {
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

export function mountWidget(
  container: HTMLElement,
  config: WidgetConfig,
  options: MountOptions = {},
): WidgetHandle {
  const host = document.createElement('div');
  host.setAttribute('data-bugping', '');
  host.style.cssText = options.preview
    ? 'all: initial;'
    : 'all: initial; position: fixed; z-index: 2147483000;';
  const shadow = host.attachShadow({ mode: 'open' });
  const sources = config.customCss ? [styles, config.customCss] : [styles];
  if (!adoptStyles(shadow, sources)) {
    for (const css of sources) shadow.append(h('style', {}, css));
  }

  const locale = resolveLocale(config.locale, options.languages ?? navigator.languages ?? []);
  const root = h('div', {
    class: 'bp-root',
    lang: locale,
    'data-position': config.position,
    'data-preview': options.preview === true,
  });
  root.style.setProperty(
    '--bp-accent',
    HEX_COLOR_PATTERN.test(config.primaryColor) ? config.primaryColor : FALLBACK_ACCENT,
  );

  let trigger: HTMLButtonElement | null = null;
  const panel = createPanel({
    config,
    t: MESSAGES[locale],
    deps: options.preview ? null : (options.deps ?? null),
    host,
    onClose: (previouslyFocused) => {
      if (trigger) {
        trigger.focus();
      } else if (previouslyFocused?.isConnected) {
        previouslyFocused.focus();
      }
    },
  });
  if (!options.hideTrigger) {
    trigger = createTrigger(config.triggerText, () =>
      panel.isOpen() ? panel.close() : panel.open('bug'),
    );
    root.append(trigger);
  }
  root.append(panel.element);
  shadow.append(root);
  container.append(host);

  return {
    host,
    open: (type = 'bug') => panel.open(type),
    close: () => panel.close(),
    isOpen: () => panel.isOpen(),
    identify: (user) => panel.setEmail(user.email ?? ''),
    destroy: () => {
      panel.destroy();
      host.remove();
    },
  };
}
