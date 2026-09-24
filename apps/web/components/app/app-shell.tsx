import { AppLink } from '@/components/app/link-prefetch';
import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { ArrowLeft, LogOut, UserRound } from 'lucide-react';
import { signOut } from '@/app/actions/session';
import { Logo } from '@/components/brand/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { MobileNav } from './mobile-nav';
import { PlanCard, type PlanKind, type ShellUsage } from './plan-card';
import { ProjectNav } from './project-nav';
import type { ShellProject } from './project-switcher';

interface ShellProps {
  projects: ShellProject[];
  email: string;
  usage: ShellUsage;
  plan: PlanKind;
  newCounts: Record<string, number>;
  /**
   * Route the project nav treats as current; defaults to the real `usePathname()`. Only the
   * landing demo's /demo/dashboard sets it, to render the feed of a fixture project.
   */
  pathname?: string;
}

const footerLink =
  'flex items-center gap-2 rounded-lg px-3 py-1.5 text-muted-foreground transition-colors duration-200 hover:bg-card/70 hover:text-foreground dark:hover:bg-accent/60';

async function Nav({ projects, email, usage, plan, newCounts, pathname }: ShellProps) {
  const t = await getTranslations('nav');
  const tAuth = await getTranslations('auth');
  return (
    <nav className="flex h-full flex-col gap-4 p-4">
      <Logo href="/app" className="px-1 pt-1" />
      <ProjectNav projects={projects} newCounts={newCounts} pathname={pathname} />
      <div className="mt-auto flex flex-col gap-3">
        <PlanCard plan={plan} usage={usage} />
        <ul className="flex flex-col gap-0.5 text-sm">
          <li>
            <AppLink href="/" className={footerLink} data-testid="nav-back-to-site">
              <ArrowLeft className="size-4 shrink-0" aria-hidden />
              {t('backToSite')}
            </AppLink>
          </li>
          <li>
            <AppLink href="/app/account" className={footerLink} data-testid="nav-account">
              <UserRound className="size-4 shrink-0" aria-hidden />
              {t('account')}
            </AppLink>
          </li>
        </ul>
        <div className="flex items-center gap-2 border-t border-sidebar-border pt-3">
          <form action={signOut} className="flex min-w-0 flex-1 items-center gap-1 text-xs">
            <span className="min-w-0 flex-1 truncate text-muted-foreground" title={email}>
              {email}
            </span>
            <button
              type="submit"
              className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors duration-200 hover:bg-card hover:text-foreground dark:hover:bg-accent"
              aria-label={tAuth('signOut')}
              title={tAuth('signOut')}
              data-testid="sign-out"
            >
              <LogOut className="size-4" aria-hidden />
            </button>
          </form>
          <ThemeToggle className="shrink-0" />
        </div>
      </div>
    </nav>
  );
}

export async function AppShell({ children, ...props }: ShellProps & { children: ReactNode }) {
  const t = await getTranslations('nav');
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 overflow-y-auto border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:block">
        <Nav {...props} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-sidebar-border bg-sidebar px-3 py-2 text-sidebar-foreground md:hidden">
          <MobileNav label={t('menu')}>
            <Nav {...props} />
          </MobileNav>
          <Logo href="/app" />
          <ThemeToggle className="ml-auto" />
        </header>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
