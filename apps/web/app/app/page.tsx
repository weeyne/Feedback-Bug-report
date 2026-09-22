import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { listProjects } from '@/lib/dashboard/projects';
import { getDeps } from '@/lib/deps';

export default async function AppIndex() {
  const user = await requireUser();
  const [first] = await listProjects(await getDeps(), user.id);
  redirect(first ? `/app/p/${first.id}/feedback` : '/app/new');
}
