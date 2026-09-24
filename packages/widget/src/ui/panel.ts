import type { ClientMetadata, SubmitPayload, WidgetConfig } from '@bugping/shared';
import { BRAND } from '@bugping/shared/brand';
import type { FeedbackType } from '@bugping/shared/constants';
import type { AnnotateFn } from '../annotate/types';
import type { SubmitResult } from '../api';
import type { Messages } from '../i18n';
import type { CaptureFn } from '../screenshot-loader';
import { createForm } from './form';
import { h } from './h';
import { createHome, type Screen } from './home';
import { createThanks } from './thanks';

export interface PanelDeps {
  projectKey: string;
  submit(payload: SubmitPayload, screenshot: Blob | null): Promise<SubmitResult>;
  loadCapture(): Promise<CaptureFn | null>;
  loadAnnotate(): Promise<AnnotateFn | null>;
  collectMetadata(): ClientMetadata;
  /** Monotonic milliseconds, e.g. `performance.now()`. */
  now(): number;
}

export type PanelScreen = 'home' | 'form' | 'thanks';

export interface Panel {
  element: HTMLElement;
  /** No type: the home screen. A type: that type's form. */
  open(type?: FeedbackType): void;
  close(): void;
  isOpen(): boolean;
  /** Prefills (or clears, with '') the identified email unless the visitor typed their own. */
  setEmail(email: string): void;
  /** Revokes screenshot preview URLs and cancels the pending auto-close timer. */
  destroy(): void;
}

/** Direction of a screen change, for the slide-in animation. */
type Direction = 'none' | 'forward' | 'back';

/** A downward drag on the sheet's handle/header past this many pixels closes it. */
const SHEET_CLOSE_DRAG_PX = 80;

/** The actually-focused element, descending into this document's own open shadow trees. */
function activeElementDeep(): HTMLElement | null {
  let active: Element | null = document.activeElement;
  while (active instanceof HTMLElement && active.shadowRoot?.activeElement) {
    active = active.shadowRoot.activeElement;
  }
  return active instanceof HTMLElement ? active : null;
}

export function createPanel(options: {
  config: WidgetConfig;
  t: Messages;
  /** null = preview: nothing is captured or sent. */
  deps: PanelDeps | null;
  /** Excluded from screenshots. */
  host: Element;
  /** The launcher, when shown: its `aria-expanded` follows the panel and it gets focus on close. */
  launcher: HTMLElement | null;
  /** True when the small-screen layout applies; evaluated at open time. */
  compact(): boolean;
}): Panel {
  const { config, t, launcher } = options;
  let screen: PanelScreen = 'home';
  let previouslyFocused: HTMLElement | null = null;
  let dragging = false;
  let dragStartY = 0;

  const home = createHome({ t, onPick: (type) => showForm(type, 'forward'), onClose: close });
  const form = createForm({
    t,
    deps: options.deps,
    host: options.host,
    onBack: () => showScreen('home', 'back'),
    onClose: close,
    onSent,
  });
  const thanks = createThanks({ t, onDone: close });
  const screens: Record<PanelScreen, Screen> = { home, form, thanks };

  // Only an https link: a config value must never become a javascript: or other-scheme URL.
  const footer =
    config.showBadge && config.badgeUrl.startsWith('https://')
      ? h(
          'div',
          { class: 'bp-foot' },
          h(
            'a',
            { class: 'bp-badge', href: config.badgeUrl, target: '_blank', rel: 'noopener' },
            `${t.poweredBy} ${BRAND.name}`,
          ),
        )
      : null;

  const sheetHandle = h('div', { class: 'bp-sheet-handle', 'aria-hidden': 'true' });

  const element = h(
    'div',
    {
      class: 'bp-panel',
      role: 'dialog',
      'aria-modal': 'false',
      hidden: true,
      // Composed key events would retarget to the host and trigger its shortcuts; keep them here.
      onkeydown: onKeydown,
      onkeypress: stopPropagation,
      onkeyup: stopPropagation,
      onpaste: (e: Event) => {
        if (screen === 'form' && !element.hidden) form.handlePaste(e as ClipboardEvent);
      },
      // Bottom-sheet dismissal: a downward drag starting on the handle or a screen's header.
      onpointerdown: onSheetPointerDown,
      onpointermove: onSheetPointerMove,
      onpointerup: onSheetPointerUp,
      onpointercancel: onSheetPointerUp,
    },
    sheetHandle,
    home.element,
    form.element,
    thanks.element,
    footer,
  );

  function isSheet() {
    return element.classList.contains('bp-sheet');
  }

  function onSheetPointerDown(event: Event) {
    const e = event as PointerEvent;
    const target = e.target;
    if (
      !isSheet() ||
      !(target instanceof Element) ||
      !target.closest('.bp-sheet-handle, .bp-home-head, .bp-form-head')
    ) {
      return;
    }
    dragging = true;
    dragStartY = e.clientY;
    element.classList.add('bp-dragging');
    (target as Element & { setPointerCapture?(id: number): void }).setPointerCapture?.(e.pointerId);
  }

  function onSheetPointerMove(event: Event) {
    if (!dragging) return;
    const dy = Math.max(0, (event as PointerEvent).clientY - dragStartY);
    element.style.transform = `translateY(${dy}px)`;
  }

  function onSheetPointerUp(event: Event) {
    if (!dragging) return;
    dragging = false;
    element.classList.remove('bp-dragging');
    const dy = Math.max(0, (event as PointerEvent).clientY - dragStartY);
    element.style.transform = '';
    if (dy > SHEET_CLOSE_DRAG_PX) close();
  }

  function showScreen(next: PanelScreen, direction: Direction, focus = true) {
    screen = next;
    element.dataset.screen = next;
    element.dataset.direction = direction;
    for (const [name, s] of Object.entries(screens)) s.element.hidden = name !== next;
    if (footer) footer.hidden = next === 'thanks';
    element.setAttribute('aria-labelledby', screens[next].titleId);
    if (focus) screens[next].focus();
  }

  function showForm(type: FeedbackType, direction: Direction) {
    form.start(type);
    showScreen('form', direction);
  }

  function setExpanded(expanded: boolean) {
    launcher?.setAttribute('aria-expanded', String(expanded));
  }

  function open(type?: FeedbackType) {
    // Re-evaluated on every open so a resize between opens picks up the right layout.
    element.classList.toggle('bp-sheet', options.compact());
    thanks.cancel();
    const wasHidden = element.hidden;
    if (wasHidden) previouslyFocused = activeElementDeep();
    // Re-opened while "thanks" still shows: start a clean session instead of staying stuck on it.
    if (screen === 'thanks') form.reset();
    element.hidden = false;
    setExpanded(true);
    if (!type) {
      showScreen('home', 'none');
    } else if (!wasHidden && screen === 'form' && form.type() === type) {
      form.focus();
    } else {
      showForm(type, 'none');
    }
  }

  function close() {
    if (element.hidden) return;
    thanks.cancel();
    element.hidden = true;
    setExpanded(false);
    if (screen === 'thanks') form.reset();
    if (launcher) launcher.focus();
    else if (previouslyFocused?.isConnected) previouslyFocused.focus();
  }

  function onSent() {
    if (element.hidden) {
      // Closed while the send was in flight: settle quietly instead of popping "thanks" back
      // open, and leave the form clean for the next open().
      form.reset();
      return;
    }
    showScreen('thanks', 'forward');
    thanks.start();
  }

  function stopPropagation(event: Event) {
    event.stopPropagation();
  }

  function onKeydown(event: Event) {
    event.stopPropagation();
    const key = (event as KeyboardEvent).key;
    if (key === 'Escape') {
      close();
      return;
    }
    if (key !== 'Tab') return;
    const focusable = Array.from(
      element.querySelectorAll<HTMLElement>('button, input, textarea, a[href]'),
    ).filter(
      (el) => el.tabIndex >= 0 && !el.closest('[hidden]') && !(el as HTMLButtonElement).disabled,
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) {
      // Nothing to move to (the thanks screen): keep focus inside the dialog.
      event.preventDefault();
      return;
    }
    const active = (element.getRootNode() as ShadowRoot | Document).activeElement;
    if ((event as KeyboardEvent).shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!(event as KeyboardEvent).shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  showScreen('home', 'none', false);

  return {
    element,
    open,
    close,
    isOpen: () => !element.hidden,
    setEmail: (value) => form.setEmail(value),
    destroy() {
      thanks.cancel();
      form.destroy();
    },
  };
}
