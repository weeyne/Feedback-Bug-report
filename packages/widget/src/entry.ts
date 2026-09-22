import { boot } from './index';

// Must run synchronously at load: currentScript is only set while the classic script executes.
boot(
  window,
  (document.currentScript as HTMLScriptElement | null) ??
    document.querySelector<HTMLScriptElement>('script[src*="widget.js"][data-project-id]') ??
    document.querySelector<HTMLScriptElement>('script[data-project-id]'),
);
