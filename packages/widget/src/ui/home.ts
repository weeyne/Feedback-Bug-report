import { FEEDBACK_TYPES, type FeedbackType } from '@bugping/shared/constants';
import type { Messages } from '../i18n';
import { h } from './h';
import { chevronIcon, closeIcon } from './icons';

export const TYPE_EMOJI: Record<FeedbackType, string> = { bug: '🐞', idea: '💡', general: '💬' };

/** What the panel needs from every screen. */
export interface Screen {
  element: HTMLElement;
  /** Id of the heading that labels the dialog while this screen shows. */
  titleId: string;
  focus(): void;
}

const TITLE_ID = 'bp-home-title';

/** Greeting header plus one card per feedback type. */
export function createHome(options: {
  t: Messages;
  onPick(type: FeedbackType): void;
  onClose(): void;
}): Screen {
  const { t } = options;
  const cards = FEEDBACK_TYPES.map((type) =>
    h(
      'button',
      { type: 'button', class: 'bp-card', 'data-type': type, onclick: () => options.onPick(type) },
      h('span', { class: 'bp-card-icon', 'aria-hidden': 'true' }, TYPE_EMOJI[type]),
      h(
        'span',
        { class: 'bp-card-text' },
        h('span', { class: 'bp-card-title' }, t.cards[type]),
        h('span', { class: 'bp-card-hint' }, t.cardHints[type]),
      ),
      chevronIcon(),
    ),
  );
  const element = h(
    'div',
    { class: 'bp-home bp-screen', hidden: true },
    h(
      'div',
      { class: 'bp-home-head' },
      h('h2', { class: 'bp-home-title', id: TITLE_ID }, t.homeTitle),
      h('p', { class: 'bp-home-subtitle' }, t.homeSubtitle),
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
    h('div', { class: 'bp-cards' }, ...cards),
  );
  return { element, titleId: TITLE_ID, focus: () => cards[0]?.focus() };
}
