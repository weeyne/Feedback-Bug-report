'use client';

import { CheckoutEventNames, initializePaddle, type Paddle } from '@paddle/paddle-js';
import { useEffect, useRef, useState } from 'react';

/** Loads Paddle.js once; `onCompleted` fires on the `checkout.completed` event. `failed` is set when the script could not load. */
export function usePaddle(opts: {
  environment: 'sandbox' | 'production';
  token: string;
  onCompleted: () => void;
}) {
  const [paddle, setPaddle] = useState<Paddle | null>(null);
  const [failed, setFailed] = useState(false);
  const onCompleted = useRef(opts.onCompleted);
  onCompleted.current = opts.onCompleted;
  useEffect(() => {
    let cancelled = false;
    void initializePaddle({
      environment: opts.environment,
      token: opts.token,
      eventCallback: (event) => {
        if (event.name === CheckoutEventNames.CHECKOUT_COMPLETED) onCompleted.current();
      },
    })
      .then((instance) => {
        if (cancelled) return;
        if (instance) setPaddle(instance);
        else setFailed(true);
      })
      .catch((error: unknown) => {
        if (!cancelled) setFailed(true);
        console.error(
          '[billing] Paddle.js failed to load',
          error instanceof Error ? error.message : 'error',
        );
      });
    return () => {
      cancelled = true;
    };
  }, [opts.environment, opts.token]);
  return { paddle, failed };
}
