import { EMAIL_MAX_LENGTH, MESSAGE_MAX_LENGTH, type FeedbackType } from '@bugping/shared/constants';
import { buildPayload, type SubmitResult } from '../api';
import type { Messages } from '../i18n';
import { h } from './h';
import { TYPE_EMOJI, type Screen } from './home';
import { backIcon, closeIcon } from './icons';
import type { PanelDeps } from './panel';
import { createShotBlock, type ShotBlockDeps } from './shot-block';

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Send never waits longer than this for a pending screenshot; it goes out without one instead. */
export const CAPTURE_WAIT_MS = 8000;

const TITLE_ID = 'bp-form-title';
const MESSAGE_ERROR_ID = 'bp-message-error';
const EMAIL_ERROR_ID = 'bp-email-error';

export interface FormScreen extends Screen {
  element: HTMLFormElement;
  type(): FeedbackType;
  /** Shows the form for `type`: new title/placeholder, fresh screenshot block, timer restarted. */
  start(type: FeedbackType, canGoBack?: boolean): void;
  /** Clears what the visitor entered (after a successful send). */
  reset(): void;
  handlePaste(event: ClipboardEvent): void;
  /** Prefills (or clears, with '') the identified email unless the visitor typed their own. */
  setEmail(email: string): void;
  destroy(): void;
}

/** Guards a loader so a synchronous throw becomes a null result, like an async failure. */
function safeLoader<T>(load: () => Promise<T | null>): () => Promise<T | null> {
  return () => {
    try {
      return load();
    } catch {
      return Promise.resolve(null);
    }
  };
}

export function createForm(options: {
  t: Messages;
  /** null = preview: nothing is captured or sent. */
  deps: PanelDeps | null;
  /** Excluded from screenshots. */
  host: Element;
  onBack(): void;
  onClose(): void;
  /** A send succeeded. */
  onSent(): void;
}): FormScreen {
  const { t, deps } = options;
  let type: FeedbackType = 'bug';
  let openedAt = 0;
  let identifiedEmail = '';
  let sending = false;

  const shotDeps: ShotBlockDeps | null = deps
    ? { loadCapture: safeLoader(deps.loadCapture), loadAnnotate: safeLoader(deps.loadAnnotate) }
    : null;
  const shotBlock = createShotBlock({ t, deps: shotDeps, host: options.host });

  const emoji = h('span', { class: 'bp-form-emoji', 'aria-hidden': 'true' });
  const titleText = h('span', {});
  const back = h(
    'button',
    {
      type: 'button',
      class: 'bp-icon-btn bp-back',
      'aria-label': t.back,
      title: t.back,
      onclick: () => options.onBack(),
    },
    backIcon(),
  );
  const message = h('textarea', {
    class: 'bp-input bp-message',
    rows: 4,
    maxlength: MESSAGE_MAX_LENGTH,
    'aria-describedby': MESSAGE_ERROR_ID,
  });
  const messageError = h('p', {
    class: 'bp-field-error bp-message-error',
    id: MESSAGE_ERROR_ID,
    role: 'alert',
  });
  const email = h('input', {
    class: 'bp-input bp-email',
    type: 'email',
    maxlength: EMAIL_MAX_LENGTH,
    placeholder: t.emailPlaceholder,
    autocomplete: 'email',
    'aria-label': t.emailLabel,
    'aria-describedby': EMAIL_ERROR_ID,
  });
  const emailError = h('p', {
    class: 'bp-field-error bp-email-error',
    id: EMAIL_ERROR_ID,
    role: 'alert',
  });
  const honeypot = h('input', {
    class: 'bp-hp',
    name: 'website',
    tabindex: -1,
    autocomplete: 'off',
    'aria-hidden': 'true',
  });
  const status = h('p', { class: 'bp-status', role: 'status' });
  const retry = h(
    'button',
    { type: 'button', class: 'bp-retry', hidden: true, onclick: () => void send() },
    t.retry,
  );
  const sendButton = h(
    'button',
    { type: 'button', class: 'bp-send', onclick: () => void send() },
    t.send,
  );

  const hasFiles = (event: Event) =>
    Array.from((event as DragEvent).dataTransfer?.types ?? []).includes('Files');

  const element = h(
    'form',
    {
      class: 'bp-form bp-screen',
      novalidate: true,
      hidden: true,
      onsubmit: (e: Event) => {
        e.preventDefault();
        void send();
      },
      // Allow dropping files (not text) onto the form; preview never accepts a drop.
      ondragover: (e: Event) => {
        if (deps && hasFiles(e)) e.preventDefault();
      },
      ondrop: (e: Event) => {
        if (!deps || !hasFiles(e)) return;
        // Always claim a file drop so the browser never navigates away to the dropped file.
        e.preventDefault();
        if (shotBlock.handleDrop(e as DragEvent)) return;
        const file = (e as DragEvent).dataTransfer?.files?.[0];
        if (file) void shotBlock.addImage(file); // not an image: the block explains why
      },
    },
    h(
      'div',
      { class: 'bp-form-head' },
      back,
      h('h2', { class: 'bp-form-title', id: TITLE_ID }, emoji, titleText),
      h(
        'button',
        {
          type: 'button',
          class: 'bp-icon-btn bp-close',
          'aria-label': t.close,
          title: t.close,
          onclick: () => options.onClose(),
        },
        closeIcon(),
      ),
    ),
    h(
      'div',
      { class: 'bp-form-body' },
      message,
      messageError,
      shotBlock.element,
      email,
      emailError,
      honeypot,
      status,
      retry,
      sendButton,
    ),
  );

  /** Monotonic milliseconds; never throws even if `deps.now()` does. */
  function safeNow(): number {
    if (!deps) return 0;
    try {
      return deps.now();
    } catch {
      return 0;
    }
  }

  function clearMessages() {
    messageError.textContent = '';
    emailError.textContent = '';
    status.textContent = '';
    retry.hidden = true;
  }

  function start(next: FeedbackType, canGoBack = true) {
    // A send in flight owns this form (its type, timer and screenshot): navigating back to a
    // form meanwhile returns to that send instead of starting a new one underneath it.
    if (sending) return;
    type = next;
    emoji.textContent = TYPE_EMOJI[next];
    titleText.textContent = t.cards[next];
    message.placeholder = t.placeholders[next];
    message.setAttribute('aria-label', t.placeholders[next]);
    back.hidden = !canGoBack;
    clearMessages();
    openedAt = safeNow();
    shotBlock.reset(next === 'bug');
  }

  function reset() {
    message.value = '';
    email.value = identifiedEmail;
    honeypot.value = '';
    clearMessages();
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
    // Everything the payload needs is read now, before any await, so nothing that happens while
    // the screenshot settles can change what this send submits.
    const sentType = type;
    const elapsedMs = safeNow() - openedAt;
    const website = honeypot.value;
    try {
      const metadata = deps.collectMetadata();
      const screenshot = await shotBlock.result(CAPTURE_WAIT_MS);
      const payload = buildPayload({
        projectKey: deps.projectKey,
        type: sentType,
        message: text,
        email: mail,
        metadata,
        elapsedMs,
        website,
      });
      const result = await deps.submit(payload, screenshot);
      if (result.ok) options.onSent();
      else showError(result.reason);
    } catch {
      showError('network');
    } finally {
      sending = false;
      setBusy(false);
    }
  }

  return {
    element,
    titleId: TITLE_ID,
    focus: () => message.focus(),
    type: () => type,
    start,
    reset,
    handlePaste: (event) => void shotBlock.handlePaste(event),
    setEmail(value: string) {
      // Replace only what identify() put there before; never text the visitor typed.
      if (!email.value || email.value === identifiedEmail) email.value = value;
      identifiedEmail = value;
    },
    destroy: () => shotBlock.destroy(),
  };
}
