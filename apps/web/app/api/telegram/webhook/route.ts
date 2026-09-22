import { getDeps } from '@/lib/deps';
import { handleTelegramWebhook } from '@/lib/telegram/webhook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return handleTelegramWebhook(await getDeps(), request);
}
