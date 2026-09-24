import type { ReactNode } from 'react';
import { AppShell } from '@/components/app/app-shell';
import type { PlanKind } from '@/components/app/plan-card';
import { requireUser } from '@/lib/auth/session';
import { billingOverview } from '@/lib/billing/checkout';
import { newCountsByProject, usage } from '@/lib/dashboard/feedback';
import { listProjects } from '@/lib/dashboard/projects';
import { getDeps } from '@/lib/deps';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const deps = await getDeps();
  const [projects, plan, billing, newCounts] = await Promise.all([
    listProjects(deps, user.id),
    usage(deps, user.id),
    billingOverview(deps, user.id),
    newCountsByProject(deps, user.id),
  ]);
  // Same rule as the billing page: lifetime wins, otherwise any active Pro is monthly.
  const kind: PlanKind =
    billing.state === 'lifetime' ? 'pro_lifetime' : plan.pro ? 'pro_monthly' : 'free';
  return (
    <AppShell projects={projects} email={user.email} usage={plan} plan={kind} newCounts={newCounts}>
      {children}
    </AppShell>
  );
}
