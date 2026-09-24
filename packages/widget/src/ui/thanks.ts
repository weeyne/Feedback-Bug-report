import type { Messages } from '../i18n';
import { h } from './h';
import type { Screen } from './home';
import { checkIcon } from './icons';

export const THANKS_CLOSE_MS = 2000;

const TITLE_ID = 'bp-thanks-title';

export interface ThanksScreen extends Screen {
  /** (Re)starts the auto-close countdown. */
  start(): void;
  cancel(): void;
}

/** Confirmation with a drawn check; calls `onDone` after THANKS_CLOSE_MS unless cancelled. */
export function createThanks(options: { t: Messages; onDone(): void }): ThanksScreen {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const element = h(
    'div',
    { class: 'bp-thanks bp-screen', role: 'status', tabindex: -1, hidden: true },
    h('span', { class: 'bp-check' }, checkIcon()),
    h('p', { class: 'bp-thanks-text', id: TITLE_ID }, options.t.thanks),
  );
  const cancel = () => clearTimeout(timer);
  return {
    element,
    titleId: TITLE_ID,
    focus: () => element.focus(),
    start() {
      cancel();
      timer = setTimeout(() => {
        try {
          options.onDone();
        } catch {
          // never surface into the host page
        }
      }, THANKS_CLOSE_MS);
    },
    cancel,
  };
}
