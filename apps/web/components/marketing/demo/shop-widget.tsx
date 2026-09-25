'use client';

import type { ClientMetadata, ConsoleError, SubmitPayload, WidgetConfig } from '@bugping/shared';
import { DEMO_SELECTORS } from '@bugping/widget/demo-selectors';
import { useEffect } from 'react';
import type { AppLocale } from '@/i18n/locale';
import {
  DEMO_CONSOLE_ERROR,
  DEMO_MESSAGE,
  DEMO_PRIMARY_COLOR,
  DEMO_PROJECT_KEY,
  DEMO_TEXT,
} from './protocol';
import {
  createDemoSubmit,
  disableProgrammaticFocus,
  isEmbedded,
  postToParent,
  withDemoShopUrl,
} from './shop-bridge';

interface WidgetHandle {
  host: HTMLElement;
  open(type?: 'bug' | 'idea' | 'general'): void;
  destroy(): void;
}

/** The part of /w/preview.js (packages/widget/src/preview.ts) the demo store uses. */
interface PreviewModule {
  mountWidget(
    container: HTMLElement,
    config: WidgetConfig,
    options: {
      deps: {
        projectKey: string;
        submit(payload: SubmitPayload, screenshot: Blob | null): Promise<{ ok: true }>;
        loadCapture(): Promise<unknown>;
        loadAnnotate(): Promise<unknown>;
        collectMetadata(): ClientMetadata;
        now(): number;
      };
    },
  ): WidgetHandle;
  createScreenshotLoader(moduleUrl: string): () => Promise<unknown>;
  createAnnotateLoader(moduleUrl: string): () => Promise<unknown>;
  collectMetadata(win: Window, consoleErrors: ConsoleError[]): ClientMetadata;
  installConsoleBuffer(
    win: Window,
    ownScriptUrl: string,
  ): { entries(): ConsoleError[]; dispose(): void };
}

// Loaded at runtime from /w/preview.js: the widget imports CSS with Vite's `?inline`, which Next cannot bundle.
const loadPreview = () =>
  import(
    /* webpackIgnore: true */ /* turbopackIgnore: true */ '/w/preview.js' as string
  ) as Promise<PreviewModule>;

/**
 * Mounts the real Bugping widget on the demo store with real capture, annotation, metadata and
 * console buffer; only `submit` is fake (no network: it hands the report to the demo stage), and
 * the reported page URL is the fictional store's (`withDemoShopUrl`).
 * With `staticFrame` it opens the bug form and fills the demo message (reduced-motion frames).
 */
export function ShopWidget({
  locale,
  badgeUrl,
  staticFrame,
}: {
  locale: AppLocale;
  badgeUrl: string;
  staticFrame: boolean;
}) {
  useEffect(() => {
    let cancelled = false;
    let handle: WidgetHandle | null = null;
    let buffer: { dispose(): void } | null = null;

    // Inside the landing's demo iframe the widget must never pull keyboard focus out of the
    // landing (see `disableProgrammaticFocus`); the director drives it with events only.
    if (isEmbedded(window)) disableProgrammaticFocus(window);

    loadPreview()
      .then((mod) => {
        if (cancelled) return;
        const url = (file: string) => new URL(`/w/${file}`, window.location.href).href;
        const consoleBuffer = mod.installConsoleBuffer(window, url('preview.js'));
        buffer = consoleBuffer;
        // The "broken checkout" of the story: a real error the real buffer records.
        console.error(DEMO_CONSOLE_ERROR);

        const config: WidgetConfig = {
          primaryColor: DEMO_PRIMARY_COLOR,
          triggerText: 'Feedback',
          position: 'bottom-right',
          showBadge: true,
          customCss: null,
          badgeUrl,
          locale,
        };
        handle = mod.mountWidget(document.body, config, {
          deps: {
            projectKey: DEMO_PROJECT_KEY,
            submit: createDemoSubmit(window),
            loadCapture: mod.createScreenshotLoader(url('screenshot.js')),
            loadAnnotate: mod.createAnnotateLoader(url('annotate.js')),
            collectMetadata: () =>
              withDemoShopUrl(mod.collectMetadata(window, consoleBuffer.entries())),
            now: () => performance.now(),
          },
        });

        if (staticFrame) {
          handle.open('bug');
          const message = handle.host.shadowRoot?.querySelector<HTMLTextAreaElement>(
            DEMO_SELECTORS.message,
          );
          if (message) {
            message.value = DEMO_TEXT[locale];
            message.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }
        postToParent(window, { type: DEMO_MESSAGE.ready });
      })
      .catch((error: unknown) => console.warn('[demo] could not load the widget', error));

    return () => {
      cancelled = true;
      handle?.destroy();
      buffer?.dispose();
    };
  }, [locale, badgeUrl, staticFrame]);

  return null;
}
