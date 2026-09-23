import { describe, expect, it } from 'vitest';
import { PADDLE_ENV, VALID_ENV } from '@/test/fixtures';
import { parseEnv } from '../env';
import { billingConfig } from './config';
import { createPaddleClient, PaddleError } from './paddle';

const config = billingConfig(parseEnv({ ...VALID_ENV, ...PADDLE_ENV }))!;

function fake(respond: (url: string, body: unknown) => Response) {
  const calls: Array<{ url: string; method: string; body: unknown; auth: string | null }> = [];
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    const url = String(input);
    calls.push({
      url,
      method: init?.method ?? 'GET',
      body,
      auth: new Headers(init?.headers).get('authorization'),
    });
    return respond(url, body);
  }) as typeof fetch;
  return { calls, client: createPaddleClient(config, fetchFn) };
}

describe('Paddle client', () => {
  it('creates a transaction with the price, user id and known customer', async () => {
    const { calls, client } = fake(() => Response.json({ data: { id: 'txn_1' } }, { status: 201 }));
    expect(
      await client.createTransaction({ priceId: 'pri_x', userId: 'u1', customerId: 'ctm_1' }),
    ).toEqual({ id: 'txn_1' });
    expect(calls[0]).toEqual({
      url: 'https://sandbox-api.paddle.com/transactions',
      method: 'POST',
      body: {
        items: [{ price_id: 'pri_x', quantity: 1 }],
        custom_data: { user_id: 'u1' },
        customer_id: 'ctm_1',
      },
      auth: `Bearer ${PADDLE_ENV.PADDLE_API_KEY}`,
    });
  });

  it('omits customer_id when unknown', async () => {
    const { calls, client } = fake(() => Response.json({ data: { id: 'txn_2' } }));
    await client.createTransaction({ priceId: 'pri_x', userId: 'u1' });
    expect(calls[0]!.body).not.toHaveProperty('customer_id');
  });

  it('cancels a subscription and treats an already-cancelled one as success', async () => {
    const ok = fake(() => Response.json({ data: { id: 'sub_1' } }));
    await ok.client.cancelSubscription('sub_1', 'next_billing_period');
    expect(ok.calls[0]).toMatchObject({
      url: 'https://sandbox-api.paddle.com/subscriptions/sub_1/cancel',
      method: 'POST',
      body: { effective_from: 'next_billing_period' },
    });
    const already = fake(() =>
      Response.json(
        { error: { code: 'subscription_locked_pending_changes', detail: 'x' } },
        { status: 400 },
      ),
    );
    await expect(
      already.client.cancelSubscription('sub_1', 'immediately'),
    ).resolves.toBeUndefined();
    // Real Paddle code (developer.paddle.com/errors) for an already-canceled subscription;
    // the brief's draft `subscription_is_canceled` is not an actual Paddle error code.
    const canceled = fake(() =>
      Response.json(
        { error: { code: 'subscription_is_canceled_action_invalid', detail: 'x' } },
        { status: 400 },
      ),
    );
    await expect(
      canceled.client.cancelSubscription('sub_1', 'immediately'),
    ).resolves.toBeUndefined();
  });

  it('returns the portal overview URL', async () => {
    const { calls, client } = fake(() =>
      Response.json({ data: { urls: { general: { overview: 'https://portal.example/o' } } } }),
    );
    expect(await client.createPortalSession('ctm_1', ['sub_1'])).toBe('https://portal.example/o');
    expect(calls[0]).toMatchObject({
      url: 'https://sandbox-api.paddle.com/customers/ctm_1/portal-sessions',
      body: { subscription_ids: ['sub_1'] },
    });
  });

  it('throws PaddleError without leaking the API key', async () => {
    const { client } = fake(() =>
      Response.json({ error: { code: 'forbidden', detail: 'no' } }, { status: 403 }),
    );
    const error = await client.createTransaction({ priceId: 'p', userId: 'u' }).catch((e) => e);
    expect(error).toBeInstanceOf(PaddleError);
    expect(error).toMatchObject({ status: 403, code: 'forbidden' });
    expect(String(error.message)).not.toContain(PADDLE_ENV.PADDLE_API_KEY);
  });
});
