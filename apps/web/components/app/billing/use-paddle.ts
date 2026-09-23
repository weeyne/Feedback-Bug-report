'use client';

import { CheckoutEventNames, initializePaddle, type Paddle } from '@paddle/paddle-js';
import { useEffect, useRef, useState } from 'react';

/** Loads Paddle.js once; `onCompleted` fires on the `checkout.completed` event. */
export function usePaddle(opts: {
  environment: 'sandbox' | 'production';
  token: string;
  onCompleted: () => void;
}) {
  const [paddle, setPaddle] = useState<Paddle | null>(null);
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
    }).then((instance) => {
      if (!cancelled && instance) setPaddle(instance);
    });
    return () => {
      cancelled = true;
    };
  }, [opts.environment, opts.token]);
  return paddle;
}
