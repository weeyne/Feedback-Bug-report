import { getDeps } from '@/lib/deps';
import { handleRetention } from '@/lib/retention';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(request: Request) {
  return handleRetention(await getDeps(), request);
}
