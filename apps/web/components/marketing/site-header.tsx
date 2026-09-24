import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { cn } from 'cn';
import { Logo } from '@/components/brand/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { buttonVariants } from '@/components/ui/button';
import { HeaderShell } from './header-shell';
import { LandingMenu } from './landing-menu';

/** Anchors are absolute (`/#…`) so they also work from the legal pages that share the layout. */
const NAV = [
  { href: '/#features', key: 'features' },
  { href: '/#how', key: 'how' },
  { href: '/#pricing', key: 'pricing' },
  { href: '/#faq', key: 'faq' },
] as const;

export async function SiteHeader() {
  const t = await getTranslations('landing');
  const items = NAV.map(({ href, key }) => ({ href, label: t(`nav.${key}`) }));
  const logIn = { href: '/login', label: t('nav.logIn') };
  return (
    <HeaderShell>
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Logo href="/" />
        <nav aria-label={t('nav.label')} className="ml-6 hidden items-center gap-1 md:flex">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors duration-200 hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle className="mr-1 hidden md:inline-block" />
          <Link
            href={logIn.href}
            className={cn(
              buttonVariants({ variant: 'ghost', size: 'lg' }),
              'hidden md:inline-flex',
            )}
          >
            {logIn.label}
          </Link>
          <Link href="/login" className={cn(buttonVariants({ size: 'lg' }), 'font-semibold')}>
            {t('startFree')}
          </Link>
          <LandingMenu
            className="md:hidden"
            items={items}
            logIn={logIn}
            menuLabel={t('nav.menu')}
            navLabel={t('nav.label')}
          />
        </div>
      </div>
    </HeaderShell>
  );
}
