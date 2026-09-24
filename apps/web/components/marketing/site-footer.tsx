import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Logo } from '@/components/brand/logo';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { ThemeToggle } from '@/components/theme-toggle';

export async function SiteFooter() {
  const t = await getTranslations('landing');
  const links = [
    { href: '/#pricing', label: t('nav.pricing') },
    { href: '/login', label: t('nav.logIn') },
    { href: '/privacy', label: t('privacy') },
    { href: '/terms', label: t('terms') },
    { href: '/refund', label: t('refund') },
  ];
  return (
    <footer className="border-t bg-muted/40">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="flex max-w-xs flex-col gap-3">
            <Logo href="/" />
            <p className="text-sm text-muted-foreground">{t('footer.tagline')}</p>
          </div>
          <nav
            aria-label={t('footer.label')}
            className="flex flex-wrap gap-x-6 gap-y-3 text-sm font-medium"
          >
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-muted-foreground transition-colors duration-200 hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex flex-col-reverse gap-4 border-t pt-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} Bugping</span>
          <div className="flex items-center gap-4">
            <LocaleSwitcher />
            <ThemeToggle />
          </div>
        </div>
      </div>
    </footer>
  );
}
