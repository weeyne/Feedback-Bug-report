import type { WidgetConfig } from '@dymcode/shared';
import { HEX_COLOR_PATTERN, type FeedbackType } from '@dymcode/shared/constants';
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
  identify(user: IdentifiedUser): void;
  destroy(): void;
}

const FALLBACK_ACCENT = '#6366f1';

export function mountWidget(
  container: HTMLElement,
  config: WidgetConfig,
  options: MountOptions = {},
): WidgetHandle {
  const host = document.createElement('div');
  host.setAttribute('data-dymcode', '');
  host.style.cssText = 'all: initial;';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.append(h('style', {}, styles));
  if (config.customCss) shadow.append(h('style', {}, config.customCss));

  const locale = resolveLocale(config.locale, options.languages ?? navigator.languages ?? []);
  const root = h('div', {
    class: 'dc-root',
    lang: locale,
    'data-position': config.position,
    'data-preview': options.preview === true,
  });
  root.style.setProperty(
    '--dc-accent',
    HEX_COLOR_PATTERN.test(config.primaryColor) ? config.primaryColor : FALLBACK_ACCENT,
  );

  let trigger: HTMLButtonElement | null = null;
  const panel = createPanel({
    config,
    t: MESSAGES[locale],
    deps: options.preview ? null : (options.deps ?? null),
    host,
    onClose: () => trigger?.focus(),
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
    identify: (user) => {
      if (user.email) panel.setEmail(user.email);
    },
    destroy: () => host.remove(),
  };
}
