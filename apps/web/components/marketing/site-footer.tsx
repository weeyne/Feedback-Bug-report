import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { Logo } from '@/components/brand/logo';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { ThemeToggle } from '@/components/theme-toggle';
import { getPathname, Link as LocalizedLink } from '@/i18n/navigation';

export async function SiteFooter() {
  const [t, locale] = await Promise.all([getTranslations('landing'), getLocale()]);
  const linkClass = 'text-muted-foreground transition-colors duration-200 hover:text-foreground';
  return (
    <footer className="border-t bg-muted/40">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="flex max-w-xs flex-col gap-3">
            <Logo href={getPathname({ href: '/', locale })} />
            <p className="text-sm text-muted-foreground">{t('footer.tagline')}</p>
          </div>
          <nav
            aria-label={t('footer.label')}
            className="flex flex-wrap gap-x-6 gap-y-3 text-sm font-medium"
          >
            {/* The public pages keep the page's locale (`/ru/...`); /login has no localized URL. */}
            <LocalizedLink href={{ pathname: '/', hash: 'pricing' }} className={linkClass}>
              {t('nav.pricing')}
            </LocalizedLink>
            <LocalizedLink href="/install" className={linkClass}>
              {t('installGuides')}
            </LocalizedLink>
            <Link href="/login" className={linkClass}>
              {t('nav.logIn')}
            </Link>
            <LocalizedLink href="/privacy" className={linkClass}>
              {t('privacy')}
            </LocalizedLink>
            <LocalizedLink href="/terms" className={linkClass}>
              {t('terms')}
            </LocalizedLink>
            <LocalizedLink href="/refund" className={linkClass}>
              {t('refund')}
            </LocalizedLink>
          </nav>
        </div>
        <div className="flex flex-col-reverse gap-4 border-t pt-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} Bugping</span>
          <div className="flex items-center gap-4">
            <LocaleSwitcher publicPage />
            <ThemeToggle />
          </div>
        </div>
      </div>
    </footer>
  );
}
