'use client';

import type { WidgetConfig } from '@bugping/shared';
import { useEffect, useRef } from 'react';

interface PreviewHandle {
  destroy(): void;
  isOpen(): boolean;
  open(): void;
}

interface PreviewModule {
  mountWidget(
    container: HTMLElement,
    config: WidgetConfig,
    options: { preview: boolean },
  ): PreviewHandle;
}

let modulePromise: Promise<PreviewModule> | null = null;
// Loaded at runtime from /w/preview.js: the widget imports CSS with Vite's `?inline`, which Next cannot bundle.
const loadPreview = () =>
  (modulePromise ??= import(
    /* webpackIgnore: true */ /* turbopackIgnore: true */ '/w/preview.js' as string
  ) as Promise<PreviewModule>);

// Remounting on every keystroke would destroy an open preview panel while the visitor is typing
// a settings field; debounce so a pause in typing is what triggers the remount.
const REMOUNT_DEBOUNCE_MS = 250;

export function WidgetPreview({ config }: { config: WidgetConfig }) {
  const ref = useRef<HTMLDivElement>(null);
  const handleRef = useRef<PreviewHandle | null>(null);
  const key = JSON.stringify(config);

  useEffect(() => {
    let cancelled = false;

    const mountFresh = () =>
      loadPreview()
        .then((mod) => {
          if (cancelled || !ref.current) return;
          handleRef.current = mod.mountWidget(ref.current, config, { preview: true });
        })
        .catch((error: unknown) => console.error('[preview]', error));

    if (!handleRef.current) {
      // First mount for this component instance: nothing to preserve, mount right away.
      void mountFresh();
      return () => {
        cancelled = true;
      };
    }

    const timer = window.setTimeout(() => {
      const previous = handleRef.current;
      if (!previous) return;
      const wasOpen = previous.isOpen();
      const previouslyFocused = document.activeElement as HTMLElement | null;
      previous.destroy();
      handleRef.current = null;
      loadPreview()
        .then((mod) => {
          if (cancelled || !ref.current) return;
          const handle = mod.mountWidget(ref.current, config, { preview: true });
          handleRef.current = handle;
          if (wasOpen) {
            handle.open();
            previouslyFocused?.focus();
          }
        })
        .catch((error: unknown) => console.error('[preview]', error));
    }, REMOUNT_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // `key` captures every config field.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Separate from the per-key effect above: this only destroys the live handle when the
  // component itself unmounts, not on every debounced remount in between.
  useEffect(
    () => () => {
      handleRef.current?.destroy();
      handleRef.current = null;
    },
    [],
  );

  return (
    <div
      ref={ref}
      data-testid="widget-preview"
      className="relative min-h-[420px] rounded-lg border bg-muted/40 p-4"
    />
  );
}
