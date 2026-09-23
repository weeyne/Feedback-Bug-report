import type { Env } from '../env';
import { billingConfig, type BillingConfig } from './config';

const TIMEOUT_MS = 10_000;
// Cancelling twice is not an error for us. Per developer.paddle.com/errors, the code for
// "this subscription is already canceled" is `subscription_is_canceled_action_invalid`
// (the brief's draft `subscription_is_canceled` does not exist in the Paddle API).
// `subscription_locked_pending_changes` means something ELSE — another scheduled change
// is blocking this one — the subscription is NOT cancelled, so that code must still throw.
const ALREADY_CANCELLED = new Set(['subscription_is_canceled_action_invalid']);
// Per developer.paddle.com/errors/customers/customer_already_exists: creating a customer with
// an email that already has one returns 409 with this code. We recover by looking it up again.
const CUSTOMER_ALREADY_EXISTS = 'customer_already_exists';

export class PaddleError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
  ) {
    super(`Paddle API error ${status}${code ? ` (${code})` : ''}`);
    this.name = 'PaddleError';
  }
}

export interface PaddleClient {
  createTransaction(input: {
    priceId: string;
    userId: string;
    customerId?: string | null;
  }): Promise<{ id: string }>;
  cancelSubscription(id: string, when: 'next_billing_period' | 'immediately'): Promise<void>;
  createPortalSession(customerId: string, subscriptionIds: string[]): Promise<string>;
  /** Looks up the Paddle customer id for this email, creating one if none exists yet. */
  ensureCustomer(email: string): Promise<string>;
}

export function createPaddleClient(config: BillingConfig, fetchFn: typeof fetch): PaddleClient {
  async function call<T>(
    path: string,
    body?: unknown,
    method: 'POST' | 'GET' = 'POST',
  ): Promise<T> {
    const response = await fetchFn(`${config.apiBase}${path}`, {
      method,
      headers: { authorization: `Bearer ${config.apiKey}`, 'content-type': 'application/json' },
      ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const json = (await response.json().catch(() => ({}))) as {
      data?: T;
      error?: { code?: string };
    };
    if (!response.ok || !json.data)
      throw new PaddleError(response.status, json.error?.code ?? null);
    return json.data;
  }

  async function findCustomerByEmail(email: string): Promise<string | null> {
    const data = await call<Array<{ id: string }>>(
      `/customers?email=${encodeURIComponent(email)}`,
      undefined,
      'GET',
    );
    return data[0]?.id ?? null;
  }

  return {
    async createTransaction({ priceId, userId, customerId }) {
      const data = await call<{ id: string }>('/transactions', {
        items: [{ price_id: priceId, quantity: 1 }],
        custom_data: { user_id: userId },
        ...(customerId ? { customer_id: customerId } : {}),
      });
      return { id: data.id };
    },
    async cancelSubscription(id, when) {
      try {
        await call(`/subscriptions/${encodeURIComponent(id)}/cancel`, { effective_from: when });
      } catch (error) {
        if (error instanceof PaddleError && error.code && ALREADY_CANCELLED.has(error.code)) return;
        throw error;
      }
    },
    async createPortalSession(customerId, subscriptionIds) {
      const data = await call<{ urls: { general: { overview: string } } }>(
        `/customers/${encodeURIComponent(customerId)}/portal-sessions`,
        { subscription_ids: subscriptionIds },
      );
      return data.urls.general.overview;
    },
    async ensureCustomer(email) {
      const existing = await findCustomerByEmail(email);
      if (existing) return existing;
      try {
        const created = await call<{ id: string }>('/customers', { email });
        return created.id;
      } catch (error) {
        if (error instanceof PaddleError && error.code === CUSTOMER_ALREADY_EXISTS) {
          const found = await findCustomerByEmail(email);
          if (found) return found;
        }
        throw error;
      }
    },
  };
}

export function paddleFromDeps(deps: { env: Env; fetch: typeof fetch }): PaddleClient | null {
  const config = billingConfig(deps.env);
  return config ? createPaddleClient(config, deps.fetch) : null;
}
