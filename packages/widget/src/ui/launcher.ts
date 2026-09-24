import { h } from './h';
import { chatIcon, closeIcon } from './icons';

/**
 * The round launcher. Both icons are always present; CSS cross-fades chat ↔ close from
 * `aria-expanded`, which the panel keeps in sync.
 */
export function createLauncher(text: string, onClick: () => void): HTMLButtonElement {
  return h(
    'button',
    {
      type: 'button',
      class: 'bp-trigger',
      title: text,
      'aria-label': text,
      'aria-haspopup': 'dialog',
      'aria-expanded': 'false',
      onclick: onClick,
    },
    chatIcon(),
    closeIcon(),
  );
}
