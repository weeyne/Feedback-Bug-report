import { FEEDBACK_TYPES, type FeedbackType } from '@bugping/shared/constants';
import type { Messages } from '../i18n';
import { h } from './h';
import { TYPE_EMOJI } from './home';

/** Delay between consecutive item entrance transitions, in ms. */
const STAGGER_MS = 40;

export interface Dial {
  element: HTMLElement;
  open(): void;
  close(): void;
  isOpen(): boolean;
}

/**
 * Mobile speed-dial: one round icon button with a label chip per feedback type, fanning out from
 * the launcher. `onPick` fires after the dial has already closed itself; `onClose` fires only for
 * an Escape dismissal, so the caller can return focus to the launcher.
 */
export function createDial(options: {
  t: Messages;
  onPick(type: FeedbackType): void;
  onClose(): void;
}): Dial {
  const items = FEEDBACK_TYPES.map((type) =>
    h(
      'button',
      {
        type: 'button',
        class: 'bp-dial-item',
        role: 'menuitem',
        'data-type': type,
        onclick: () => {
          close();
          options.onPick(type);
        },
      },
      h('span', { class: 'bp-dial-label' }, options.t.cards[type]),
      h('span', { class: 'bp-dial-icon', 'aria-hidden': 'true' }, TYPE_EMOJI[type]),
    ),
  );

  const element = h(
    'div',
    { class: 'bp-dial', role: 'menu', hidden: true, onkeydown: onKeydown },
    ...items,
  );

  /** The dial item that currently has focus, descending into this document's own shadow trees. */
  function focusedIndex(): number {
    const active = (element.getRootNode() as ShadowRoot | Document).activeElement;
    return items.indexOf(active as HTMLButtonElement);
  }

  function onKeydown(event: Event) {
    const e = event as KeyboardEvent;
    e.stopPropagation();
    if (e.key === 'Escape') {
      close();
      options.onClose();
      return;
    }
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const current = focusedIndex();
    const step = e.key === 'ArrowDown' ? 1 : -1;
    const next = current === -1 ? 0 : (current + step + items.length) % items.length;
    items[next]?.focus();
  }

  function open() {
    element.hidden = false;
    items.forEach((item, i) => {
      item.style.transitionDelay = `${i * STAGGER_MS}ms`;
    });
    // Force a reflow so the rise-and-fade transition plays from the resting state below instead
    // of jumping straight to the open one.
    void element.offsetHeight;
    element.classList.add('bp-dial-open');
    items[0]?.focus();
  }

  function close() {
    element.hidden = true;
    element.classList.remove('bp-dial-open');
  }

  return { element, open, close, isOpen: () => !element.hidden };
}
