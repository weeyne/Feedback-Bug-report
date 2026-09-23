import { signPaddle } from '@/lib/billing/signature';

let seq = 0;
const nextId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${(seq++).toString(36)}`;

export function subscriptionEvent(input: {
  type: string;
  userId?: string;
  subscriptionId?: string;
  customerId?: string;
  status: string;
  priceId: string;
  occurredAt: string;
  endsAt?: string | null;
  scheduledCancel?: boolean;
}) {
  return {
    event_id: nextId('evt'),
    event_type: input.type,
    occurred_at: input.occurredAt,
    data: {
      id: input.subscriptionId ?? 'sub_1',
      status: input.status,
      customer_id: input.customerId ?? 'ctm_1',
      custom_data: input.userId ? { user_id: input.userId } : null,
      items: [{ price: { id: input.priceId } }],
      current_billing_period:
        input.endsAt === null
          ? null
          : { starts_at: '2026-09-01T00:00:00Z', ends_at: input.endsAt ?? '2026-10-01T00:00:00Z' },
      scheduled_change: input.scheduledCancel
        ? { action: 'cancel', effective_at: input.endsAt ?? '2026-10-01T00:00:00Z' }
        : null,
    },
  };
}

export function transactionCompleted(input: {
  userId?: string;
  transactionId?: string;
  customerId?: string;
  priceId: string;
  subscriptionId?: string | null;
  occurredAt: string;
}) {
  return {
    event_id: nextId('evt'),
    event_type: 'transaction.completed',
    occurred_at: input.occurredAt,
    data: {
      id: input.transactionId ?? 'txn_1',
      status: 'completed',
      customer_id: input.customerId ?? 'ctm_1',
      subscription_id: input.subscriptionId ?? null,
      custom_data: input.userId ? { user_id: input.userId } : null,
      items: [{ price: { id: input.priceId } }],
    },
  };
}

export function adjustmentEvent(input: {
  transactionId: string;
  action: 'refund' | 'chargeback' | 'credit';
  type: 'full' | 'partial';
  status: string;
  occurredAt: string;
}) {
  return {
    event_id: nextId('evt'),
    event_type: 'adjustment.updated',
    occurred_at: input.occurredAt,
    data: {
      id: nextId('adj'),
      action: input.action,
      type: input.type,
      status: input.status,
      transaction_id: input.transactionId,
    },
  };
}

export function signedRequest(event: object, secret: string, nowMs = Date.now()): Request {
  const body = JSON.stringify(event);
  return new Request('https://dymcode.dev/api/billing/webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'paddle-signature': signPaddle(body, secret, Math.floor(nowMs / 1000)),
    },
    body,
  });
}
