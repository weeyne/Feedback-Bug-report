import { getDeps } from '@/lib/deps';
import { preflight } from '@/lib/http';
import { handleConfig } from '@/lib/widget/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return handleConfig(await getDeps(), request);
}

export function OPTIONS(request: Request) {
  return preflight(request);
}
