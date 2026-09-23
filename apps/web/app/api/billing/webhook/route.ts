import { handleBillingWebhook } from '@/lib/billing/webhook';
import { getDeps } from '@/lib/deps';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return handleBillingWebhook(await getDeps(), request);
}
