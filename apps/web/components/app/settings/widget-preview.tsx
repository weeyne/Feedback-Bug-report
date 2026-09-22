'use client';

import type { WidgetConfig } from '@dymcode/shared';
import { useEffect, useRef } from 'react';

interface PreviewModule {
  mountWidget(
    container: HTMLElement,
    config: WidgetConfig,
    options: { preview: boolean },
  ): { destroy(): void };
}

let modulePromise: Promise<PreviewModule> | null = null;
// Loaded at runtime from /w/preview.js: the widget imports CSS with Vite's `?inline`, which Next cannot bundle.
const loadPreview = () =>
  (modulePromise ??= import(
    /* webpackIgnore: true */ /* turbopackIgnore: true */ '/w/preview.js' as string
  ) as Promise<PreviewModule>);

export function WidgetPreview({ config }: { config: WidgetConfig }) {
  const ref = useRef<HTMLDivElement>(null);
  const key = JSON.stringify(config);
  useEffect(() => {
    let handle: { destroy(): void } | null = null;
    let cancelled = false;
    loadPreview()
      .then((mod) => {
        if (!cancelled && ref.current)
          handle = mod.mountWidget(ref.current, config, { preview: true });
      })
      .catch((error: unknown) => console.error('[preview]', error));
    return () => {
      cancelled = true;
      handle?.destroy();
    };
    // `key` captures every config field.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return (
    <div
      ref={ref}
      data-testid="widget-preview"
      className="relative min-h-[420px] rounded-lg border bg-muted/40 p-4"
    />
  );
}
