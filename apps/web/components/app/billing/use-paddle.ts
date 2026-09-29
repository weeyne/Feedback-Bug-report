'use client';

import { CheckoutEventNames, initializePaddle, type Paddle } from '@paddle/paddle-js';
import { useEffect, useRef, useState } from 'react';

/** Loads Paddle.js once; `onCompleted` fires on the `checkout.completed` event. `failed` is set only when the script could not load (blocked or offline). */
export function usePaddle(opts: {
  environment: 'sandbox' | 'production';
  token: string;
  onCompleted: () => void;
}) {
  const [paddle, setPaddle] = useState<Paddle | null>(null);
  const [failed, setFailed] = useState(false);
  const onCompleted = useRef(opts.onCompleted);
  // eslint-disable-next-line react/refs -- latest-callback ref: the Paddle event handler must see the newest onCompleted
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
        // Initialize errors are swallowed by the SDK (the instance still comes back); a missing
        // instance is not a blocked script, so neither shows the ad-blocker message.
        if (instance) setPaddle(instance);
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
