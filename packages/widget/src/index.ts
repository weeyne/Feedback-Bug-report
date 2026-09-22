import { fetchConfig, submitFeedback } from './api';
import { installConsoleBuffer } from './context/console-buffer';
import { collectMetadata } from './context/metadata';
import { createPublicApi, type ApiState } from './public-api';
import { createScreenshotLoader } from './screenshot-loader';
import { mountWidget } from './ui/mount';

declare global {
  interface Window {
    Dymcode?: unknown;
  }
}

const warn = (message: string) => {
  try {
    console.warn(`[Dymcode] ${message}`);
  } catch {
    // Console may be unavailable; nothing else to do.
  }
};

/** Starts the widget for `script` (the embed tag). Safe to call twice; never throws. */
export function boot(win: Window & typeof globalThis, script: HTMLScriptElement | null): void {
  try {
    if (win.Dymcode || !script) return;
    const projectKey = script.dataset.projectId;
    if (!projectKey) return warn('missing data-project-id on the script tag');

    const scriptUrl = new URL(script.src, win.location.href).href;
    const apiOrigin = new URL(scriptUrl).origin;
    const buffer = installConsoleBuffer(win, scriptUrl);
    const state: ApiState = { handle: null, user: undefined };
    win.Dymcode = createPublicApi(state, warn);
    const loadCapture = createScreenshotLoader(
      new URL(`screenshot.js?v=${encodeURIComponent(__WIDGET_VERSION__)}`, scriptUrl).href,
    );

    const start = async () => {
      const config = await fetchConfig(apiOrigin, projectKey);
      if (!config) {
        buffer.dispose();
        return warn('could not load the widget config');
      }
      state.handle = mountWidget(win.document.body, config, {
        hideTrigger: script.hasAttribute('data-hide-trigger'),
        deps: {
          projectKey,
          submit: (payload, screenshot) => submitFeedback(apiOrigin, payload, screenshot),
          loadCapture,
          collectMetadata: () => collectMetadata(win, buffer.entries(), state.user),
          now: () => win.performance.now(),
        },
      });
      if (state.user) state.handle.identify(state.user);
      win.dispatchEvent(new Event('dymcode:ready'));
    };

    const run = () => void start().catch(() => warn('failed to start'));
    if (typeof win.requestIdleCallback === 'function')
      win.requestIdleCallback(run, { timeout: 3000 });
    else win.setTimeout(run, 1);
  } catch {
    warn('failed to start');
  }
}
