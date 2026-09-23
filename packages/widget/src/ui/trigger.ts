import { h } from './h';

export function createTrigger(text: string, onClick: () => void): HTMLButtonElement {
  return h(
    'button',
    { type: 'button', class: 'bp-trigger', 'aria-haspopup': 'dialog', onclick: onClick },
    text,
  );
}
