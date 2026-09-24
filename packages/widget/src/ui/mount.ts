import type { WidgetConfig } from '@bugping/shared';
import { HEX_COLOR_PATTERN, type FeedbackType } from '@bugping/shared/constants';
import type { IdentifiedUser } from '../context/metadata';
import { MESSAGES, resolveLocale } from '../i18n';
import { onAccent, tint } from './color';
import { createDial, type Dial } from './dial';
import { h } from './h';
import { createLauncher } from './launcher';
import { createPanel, type PanelDeps } from './panel';
import styles from './styles.css?inline';

export type { PanelDeps } from './panel';

export interface MountOptions {
  /** Dashboard live preview: renders the UI but never captures or submits. */
  preview?: boolean;
  hideTrigger?: boolean;
  deps?: PanelDeps;
  /** Defaults to `navigator.languages`; used when the config locale is `auto`. */
  languages?: readonly string[];
  /**
   * True when the small-screen layout applies; evaluated at open time.
   * Defaults to `matchMedia('(max-width: 640px)')` (false where matchMedia is missing).
   */
  compact?: () => boolean;
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

function defaultCompact(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(max-width: 640px)').matches;
  } catch {
    return false;
  }
}

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
  const accent = HEX_COLOR_PATTERN.test(config.primaryColor)
    ? config.primaryColor
    : FALLBACK_ACCENT;
  root.style.setProperty('--bp-accent', accent);
  root.style.setProperty('--bp-accent-2', tint(accent, 0.25));
  root.style.setProperty('--bp-on-accent', onAccent(accent));

  const isCompact = options.compact ?? defaultCompact;
  let dial: Dial | null = null;

  function setLauncherExpanded(expanded: boolean) {
    launcher?.setAttribute('aria-expanded', String(expanded));
  }

  /** No type: the dial on a compact launcher, else the home screen (or the sheet, hidden-trigger). */
  function openWidget(type?: FeedbackType) {
    if (type || !dial || !isCompact()) {
      dial?.close();
      panel.open(type);
      return;
    }
    panel.close();
    dial.open();
    setLauncherExpanded(true);
  }

  const launcher = options.hideTrigger
    ? null
    : createLauncher(config.triggerText, () => {
        if (dial?.isOpen()) {
          dial.close();
          setLauncherExpanded(false);
          return;
        }
        if (panel.isOpen()) {
          panel.close();
          return;
        }
        openWidget();
      });
  const panel = createPanel({
    config,
    t: MESSAGES[locale],
    deps: options.preview ? null : (options.deps ?? null),
    host,
    launcher,
    compact: isCompact,
  });
  if (launcher) {
    dial = createDial({
      t: MESSAGES[locale],
      onPick: (type) => panel.open(type),
      onClose: () => {
        setLauncherExpanded(false);
        launcher.focus();
      },
    });
  }
  if (launcher) root.append(launcher);
  if (dial) root.append(dial.element);
  root.append(panel.element);
  shadow.append(root);
  container.append(host);

  return {
    host,
    open: (type) => openWidget(type),
    close: () => {
      if (dial?.isOpen()) {
        dial.close();
        setLauncherExpanded(false);
      }
      panel.close();
    },
    isOpen: () => panel.isOpen() || (dial?.isOpen() ?? false),
    identify: (user) => panel.setEmail(user.email ?? ''),
    destroy: () => {
      panel.destroy();
      host.remove();
    },
  };
}
