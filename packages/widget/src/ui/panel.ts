import type { ClientMetadata, SubmitPayload, WidgetConfig } from '@dymcode/shared';
import { BRAND } from '@dymcode/shared/brand';
import {
  EMAIL_MAX_LENGTH,
  FEEDBACK_TYPES,
  MESSAGE_MAX_LENGTH,
  type FeedbackType,
} from '@dymcode/shared/constants';
import { buildPayload, type SubmitResult } from '../api';
import type { Messages } from '../i18n';
import type { CaptureFn } from '../screenshot-loader';
import { h } from './h';

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const THANKS_CLOSE_MS = 2000;
/** Send never waits longer than this for a pending screenshot; it goes out without one instead. */
const CAPTURE_WAIT_MS = 8000;

export interface PanelDeps {
  projectKey: string;
  submit(payload: SubmitPayload, screenshot: Blob | null): Promise<SubmitResult>;
  loadCapture(): Promise<CaptureFn | null>;
  collectMetadata(): ClientMetadata;
  /** Monotonic milliseconds, e.g. `performance.now()`. */
  now(): number;
}

export interface Panel {
  element: HTMLElement;
  open(type: FeedbackType): void;
  close(): void;
  isOpen(): boolean;
  setEmail(email: string): void;
  /** Revokes the current screenshot preview URL and cancels the pending auto-close timer. */
  destroy(): void;
}

type ShotState = 'loading' | 'ready' | 'unavailable';

/** Resolves true if `promise` settles within `ms`, false otherwise. Never rejects. */
function settlesWithin(promise: Promise<unknown>, ms: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cap = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), ms);
  });
  const done = promise.then(
    () => true,
    () => true,
  );
  return Promise.race([done, cap]).finally(() => clearTimeout(timer));
}

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
  onClose(previouslyFocused: HTMLElement | null): void;
}): Panel {
  const { config, t, deps } = options;
  let type: FeedbackType = 'bug';
  let openedAt = 0;
  let shot: Blob | null = null;
  let shotUrl: string | null = null;
  let capturing: Promise<void> = Promise.resolve();
  let captureGeneration = 0;
  let identifiedEmail = '';
  let sending = false;
  let closeTimer: ReturnType<typeof setTimeout> | undefined;
  let previouslyFocused: HTMLElement | null = null;

  const typeButtons = FEEDBACK_TYPES.map((ft) =>
    h(
      'button',
      {
        type: 'button',
        class: 'dc-type',
        'data-type': ft,
        'aria-pressed': 'false',
        onclick: () => selectType(ft),
      },
      t.types[ft],
    ),
  );
  const message = h('textarea', {
    class: 'dc-input dc-message',
    rows: 4,
    maxlength: MESSAGE_MAX_LENGTH,
  });
  const messageError = h('p', { class: 'dc-field-error dc-message-error', role: 'alert' });
  const email = h('input', {
    class: 'dc-input dc-email',
    type: 'email',
    maxlength: EMAIL_MAX_LENGTH,
    placeholder: t.emailPlaceholder,
    autocomplete: 'email',
    'aria-label': t.emailLabel,
  });
  const emailError = h('p', { class: 'dc-field-error dc-email-error', role: 'alert' });
  const honeypot = h('input', {
    class: 'dc-hp',
    name: 'website',
    tabindex: -1,
    autocomplete: 'off',
    'aria-hidden': 'true',
  });
  const shotToggle = h('input', { type: 'checkbox', class: 'dc-shot-toggle', checked: true });
  const thumb = h('span', { class: 'dc-thumb', 'data-state': 'loading' });
  const shotText = h('span', {}, t.screenshot);
  const status = h('p', { class: 'dc-status', role: 'status' });
  const retry = h(
    'button',
    { type: 'button', class: 'dc-retry', hidden: true, onclick: () => void send() },
    t.retry,
  );
  const sendButton = h(
    'button',
    { type: 'button', class: 'dc-send', onclick: () => void send() },
    t.send,
  );
  const form = h(
    'form',
    {
      class: 'dc-form',
      novalidate: true,
      onsubmit: (e: Event) => {
        e.preventDefault();
        void send();
      },
    },
    h('div', { class: 'dc-types', role: 'group' }, ...typeButtons),
    message,
    messageError,
    email,
    emailError,
    honeypot,
    h('label', { class: 'dc-shot' }, shotToggle, thumb, shotText),
    status,
    retry,
    sendButton,
  );
  const thanks = h('p', { class: 'dc-thanks', role: 'status', hidden: true }, t.thanks);
  const badge = config.showBadge
    ? h(
        'a',
        { class: 'dc-badge', href: config.badgeUrl, target: '_blank', rel: 'noopener' },
        `${t.poweredBy} ${BRAND.name}`,
      )
    : null;
  const element = h(
    'div',
    {
      class: 'dc-panel',
      role: 'dialog',
      'aria-modal': 'false',
      'aria-labelledby': 'dc-title',
      hidden: true,
      // Composed key events would retarget to the host and trigger its shortcuts; keep them here.
      onkeydown: onKeydown,
      onkeypress: stopPropagation,
      onkeyup: stopPropagation,
    },
    h(
      'div',
      { class: 'dc-head' },
      h('h2', { class: 'dc-title', id: 'dc-title' }, t.title),
      h(
        'button',
        { type: 'button', class: 'dc-close', 'aria-label': t.close, onclick: () => close() },
        '×',
      ),
    ),
    form,
    thanks,
    badge,
  );

  function selectType(next: FeedbackType) {
    type = next;
    for (const button of typeButtons) {
      button.setAttribute('aria-pressed', String(button.dataset.type === next));
    }
    message.placeholder = t.placeholders[next];
    message.setAttribute('aria-label', t.placeholders[next]);
  }

  function setShot(state: ShotState, blob: Blob | null = null) {
    shot = blob;
    thumb.dataset.state = state;
    thumb.replaceChildren();
    if (shotUrl) {
      try {
        URL.revokeObjectURL(shotUrl);
      } catch {
        // best-effort cleanup only
      }
    }
    shotUrl = null;
    const unavailable = state === 'unavailable';
    shotToggle.disabled = unavailable;
    if (unavailable) shotToggle.checked = false;
    shotText.textContent = unavailable ? t.screenshotUnavailable : t.screenshot;
    if (blob) {
      try {
        if (typeof URL.createObjectURL === 'function') {
          shotUrl = URL.createObjectURL(blob);
          thumb.append(h('img', { src: shotUrl, alt: '' }));
        }
      } catch {
        // no inline preview available; the toggle above still reflects a usable screenshot
      }
    }
  }

  /** One capture per open: a generation counter drops results from a capture that is no longer current. */
  function startCapture() {
    shotToggle.checked = true;
    const generation = ++captureGeneration;
    if (!deps) {
      setShot('ready');
      return;
    }
    setShot('loading');
    let request: Promise<CaptureFn | null>;
    try {
      request = deps.loadCapture();
    } catch {
      request = Promise.resolve(null);
    }
    capturing = request
      .then((captureFn) => (captureFn ? captureFn(options.host) : null))
      .then(
        (blob) => {
          if (generation === captureGeneration) setShot(blob ? 'ready' : 'unavailable', blob);
        },
        () => {
          if (generation === captureGeneration) setShot('unavailable');
        },
      );
  }

  function showForm() {
    form.hidden = false;
    thanks.hidden = true;
  }

  function reset() {
    message.value = '';
    email.value = identifiedEmail;
    honeypot.value = '';
    messageError.textContent = '';
    emailError.textContent = '';
    status.textContent = '';
    retry.hidden = true;
    showForm();
  }

  /** Monotonic milliseconds; never throws even if `deps.now()` does. */
  function safeNow(): number {
    if (!deps) return 0;
    try {
      return deps.now();
    } catch {
      return 0;
    }
  }

  function open(next: FeedbackType) {
    clearTimeout(closeTimer);
    previouslyFocused = activeElementDeep();
    selectType(next);
    if (element.hidden) {
      element.hidden = false;
      showForm();
      openedAt = safeNow();
      startCapture();
    } else if (!thanks.hidden) {
      // Re-opened while the "thanks" state was still showing: start a clean session instead of
      // leaving the panel stuck on the previous submission.
      reset();
      openedAt = safeNow();
      startCapture();
    }
    message.focus();
  }

  function close() {
    if (element.hidden) return;
    clearTimeout(closeTimer);
    element.hidden = true;
    if (!thanks.hidden) reset();
    options.onClose(previouslyFocused);
  }

  function setBusy(busy: boolean) {
    sendButton.disabled = busy;
    retry.disabled = busy;
    sendButton.textContent = busy ? t.sending : t.send;
    if (busy) sendButton.setAttribute('aria-busy', 'true');
    else sendButton.removeAttribute('aria-busy');
  }

  function showError(reason: Exclude<SubmitResult, { ok: true }>['reason']) {
    status.textContent =
      reason === 'rate_limited'
        ? t.errorRateLimited
        : reason === 'network'
          ? t.errorNetwork
          : t.errorInvalid;
    retry.hidden = reason === 'rate_limited' || reason === 'invalid';
  }

  async function send() {
    if (!deps || sending) return;
    const text = message.value.trim();
    const mail = email.value.trim();
    messageError.textContent = text ? '' : t.errorRequired;
    emailError.textContent = mail && !EMAIL_SHAPE.test(mail) ? t.errorEmail : '';
    if (!text) return message.focus();
    if (emailError.textContent) return email.focus();

    sending = true;
    setBusy(true);
    status.textContent = '';
    retry.hidden = true;
    try {
      let withShot = shotToggle.checked;
      if (withShot) withShot = await settlesWithin(capturing, CAPTURE_WAIT_MS);
      const payload = buildPayload({
        projectKey: deps.projectKey,
        type,
        message: text,
        email: mail,
        metadata: deps.collectMetadata(),
        elapsedMs: safeNow() - openedAt,
        website: honeypot.value,
      });
      const result = await deps.submit(payload, withShot && shotToggle.checked ? shot : null);
      if (result.ok) {
        if (element.hidden) {
          // The panel was closed while this send was in flight: settle quietly instead of
          // popping "thanks" back open, and leave the form clean for the next open().
          reset();
        } else {
          form.hidden = true;
          thanks.hidden = false;
          closeTimer = setTimeout(close, THANKS_CLOSE_MS);
        }
      } else {
        showError(result.reason);
      }
    } catch {
      showError('network');
    } finally {
      sending = false;
      setBusy(false);
    }
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
    if (!first || !last) return;
    const active = (element.getRootNode() as ShadowRoot | Document).activeElement;
    if ((event as KeyboardEvent).shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!(event as KeyboardEvent).shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function destroy() {
    clearTimeout(closeTimer);
    if (shotUrl) {
      try {
        URL.revokeObjectURL(shotUrl);
      } catch {
        // best-effort cleanup only
      }
      shotUrl = null;
    }
  }

  selectType('bug');

  return {
    element,
    open,
    close,
    isOpen: () => !element.hidden,
    setEmail(value: string) {
      identifiedEmail = value;
      if (!email.value) email.value = value;
    },
    destroy,
  };
}
