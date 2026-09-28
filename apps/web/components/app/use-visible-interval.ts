'use client';

import { useEffect, useRef } from 'react';
import { createVisibleInterval } from '@/lib/visible-interval';

export function useVisibleInterval(
  run: () => Promise<unknown> | unknown,
  intervalMs: number,
  { enabled = true, runOnVisible = false }: { enabled?: boolean; runOnVisible?: boolean } = {},
) {
  const latest = useRef(run);
  useEffect(() => {
    latest.current = run;
  });
  useEffect(() => {
    if (!enabled) return;
    return createVisibleInterval({
      run: () => latest.current(),
      intervalMs,
      runOnVisible,
      isHidden: () => document.hidden,
      subscribeVisibility: (onChange) => {
        document.addEventListener('visibilitychange', onChange);
        return () => document.removeEventListener('visibilitychange', onChange);
      },
    });
  }, [intervalMs, enabled, runOnVisible]);
}
