import { describe, expect, it } from 'vitest';
import { PADDLE_ENV, VALID_ENV } from '@/test/fixtures';
import { parseEnv } from '../env';
import { billingConfig } from './config';
import { createPaddleClient, InvalidCustomerEmail, PaddleError } from './paddle';

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

  it('cancels a subscription', async () => {
    const ok = fake(() => Response.json({ data: { id: 'sub_1' } }));
    await ok.client.cancelSubscription('sub_1', 'next_billing_period');
    expect(ok.calls[0]).toMatchObject({
      url: 'https://sandbox-api.paddle.com/subscriptions/sub_1/cancel',
      method: 'POST',
      body: { effective_from: 'next_billing_period' },
    });
  });

  it('treats an already-cancelled subscription as success', async () => {
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

  it('rejects when another scheduled change blocks the cancellation', async () => {
    // subscription_locked_pending_changes means a DIFFERENT scheduled change is blocking
    // this request — the subscription is NOT cancelled, so this must surface as a failure,
    // not be swallowed like the already-cancelled case above.
    const locked = fake(() =>
      Response.json(
        { error: { code: 'subscription_locked_pending_changes', detail: 'x' } },
        { status: 400 },
      ),
    );
    const error = await locked.client.cancelSubscription('sub_1', 'immediately').catch((e) => e);
    expect(error).toBeInstanceOf(PaddleError);
    expect(error).toMatchObject({ status: 400, code: 'subscription_locked_pending_changes' });
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

  describe('findCustomer', () => {
    it('returns the first matching customer id, or null, without creating one', async () => {
      const found = fake(() => Response.json({ data: [{ id: 'ctm_a' }, { id: 'ctm_b' }] }));
      expect(await found.client.findCustomer('u@example.com')).toBe('ctm_a');
      expect(found.calls).toEqual([
        expect.objectContaining({
          method: 'GET',
          url: 'https://sandbox-api.paddle.com/customers?email=u%40example.com',
        }),
      ]);
      const none = fake(() => Response.json({ data: [] }));
      expect(await none.client.findCustomer('u@example.com')).toBeNull();
      expect(none.calls).toHaveLength(1);
    });

    it('lowercases and trims the email in the query', async () => {
      const { calls, client } = fake(() => Response.json({ data: [] }));
      await client.findCustomer('  Mixed.Case@Example.COM ');
      expect(calls[0]!.url).toBe(
        'https://sandbox-api.paddle.com/customers?email=mixed.case%40example.com',
      );
    });

    it('rejects an empty, blank or comma-separated email without calling Paddle', async () => {
      const { calls, client } = fake(() => Response.json({ data: [{ id: 'ctm_x' }] }));
      for (const email of ['', '   ', 'a@example.com,victim@example.com']) {
        await expect(client.findCustomer(email)).rejects.toBeInstanceOf(InvalidCustomerEmail);
      }
      expect(calls).toEqual([]);
    });

    it('rejects Paddle errors as PaddleError', async () => {
      const { client } = fake(() =>
        Response.json({ error: { code: 'forbidden' } }, { status: 403 }),
      );
      await expect(client.findCustomer('u@example.com')).rejects.toBeInstanceOf(PaddleError);
    });
  });

  describe('ensureCustomer', () => {
    it('lowercases and trims the email for the lookup and the creation', async () => {
      const { calls, client } = fake((url) =>
        url.includes('/customers?email=')
          ? Response.json({ data: [] })
          : Response.json({ data: { id: 'ctm_new' } }, { status: 201 }),
      );
      expect(await client.ensureCustomer(' New@Example.com')).toBe('ctm_new');
      expect(calls[0]!.url).toBe(
        'https://sandbox-api.paddle.com/customers?email=new%40example.com',
      );
      expect(calls[1]!.body).toEqual({ email: 'new@example.com' });
    });

    it('rejects an empty, blank or comma-separated email without calling Paddle', async () => {
      const { calls, client } = fake(() => Response.json({ data: [{ id: 'ctm_x' }] }));
      for (const email of ['', ' 	 ', 'a@example.com,b@example.com']) {
        await expect(client.ensureCustomer(email)).rejects.toBeInstanceOf(InvalidCustomerEmail);
      }
      expect(calls).toEqual([]);
    });

    it('returns the existing customer id without creating one', async () => {
      const { calls, client } = fake((url) => {
        expect(url).toBe('https://sandbox-api.paddle.com/customers?email=u%40example.com');
        return Response.json({ data: [{ id: 'ctm_found' }] });
      });
      expect(await client.ensureCustomer('u@example.com')).toBe('ctm_found');
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({ method: 'GET' });
    });

    it('creates a customer when none is found', async () => {
      const { calls, client } = fake((url) =>
        url.includes('/customers?email=')
          ? Response.json({ data: [] })
          : Response.json({ data: { id: 'ctm_new' } }, { status: 201 }),
      );
      expect(await client.ensureCustomer('new@example.com')).toBe('ctm_new');
      expect(calls).toHaveLength(2);
      expect(calls[0]).toMatchObject({
        method: 'GET',
        url: 'https://sandbox-api.paddle.com/customers?email=new%40example.com',
      });
      expect(calls[1]).toMatchObject({
        method: 'POST',
        url: 'https://sandbox-api.paddle.com/customers',
        body: { email: 'new@example.com' },
      });
    });

    it('looks up again when creation races another request for the same email', async () => {
      let posted = false;
      const { calls, client } = fake((url) => {
        if (url.includes('/customers?email=')) {
          return posted
            ? Response.json({ data: [{ id: 'ctm_race' }] })
            : Response.json({ data: [] });
        }
        posted = true;
        return Response.json(
          { error: { code: 'customer_already_exists', detail: 'x' } },
          { status: 409 },
        );
      });
      expect(await client.ensureCustomer('race@example.com')).toBe('ctm_race');
      expect(calls).toHaveLength(3);
    });

    it('rejects other errors as PaddleError', async () => {
      const { client } = fake(() =>
        Response.json({ error: { code: 'internal_error' } }, { status: 500 }),
      );
      const error = await client.ensureCustomer('u@example.com').catch((e) => e);
      expect(error).toBeInstanceOf(PaddleError);
      expect(error).toMatchObject({ status: 500, code: 'internal_error' });
    });
  });
});
