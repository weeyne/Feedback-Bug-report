import Link from 'next/link';
import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { signOut } from '@/app/actions/session';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { ProjectNav } from './project-nav';
import type { ShellProject } from './project-switcher';

async function Nav({ projects, email }: { projects: ShellProject[]; email: string }) {
  const t = await getTranslations('nav');
  const tAuth = await getTranslations('auth');
  return (
    <nav className="flex h-full flex-col gap-4 p-4">
      <Link href="/app" className="text-lg font-semibold">
        Dymcode
      </Link>
      <ProjectNav projects={projects} />
      <ul className="mt-auto flex flex-col gap-1 text-sm">
        <li>
          <Link
            href="/app/billing"
            className="block rounded-md px-3 py-2 hover:bg-muted"
            data-testid="nav-billing"
          >
            {t('billing')}
          </Link>
        </li>
        <li>
          <Link
            href="/app/account"
            className="block rounded-md px-3 py-2 hover:bg-muted"
            data-testid="nav-account"
          >
            {t('account')}
          </Link>
        </li>
      </ul>
      <form action={signOut} className="border-t pt-3 text-xs text-muted-foreground">
        <div className="truncate">{email}</div>
        <button type="submit" className="mt-1 underline">
          {tAuth('signOut')}
        </button>
      </form>
    </nav>
  );
}

export async function AppShell(props: {
  projects: ShellProject[];
  email: string;
  children: ReactNode;
}) {
  const t = await getTranslations('nav');
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 border-r md:block">
        <Nav {...props} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b p-3 md:hidden">
          <Sheet>
            <SheetTrigger className="rounded-md border px-3 py-1 text-sm">{t('menu')}</SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <Nav {...props} />
            </SheetContent>
          </Sheet>
          <span className="font-semibold">Dymcode</span>
        </header>
        <main className="min-w-0 flex-1">{props.children}</main>
      </div>
    </div>
  );
}
