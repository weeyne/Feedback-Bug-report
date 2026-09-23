import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { LocaleSwitcher } from '@/components/locale-switcher';

export async function SiteFooter() {
  const t = await getTranslations('landing');
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-6 text-sm text-muted-foreground">
        <span>© {new Date().getFullYear()} Dymcode</span>
        <nav className="flex items-center gap-4">
          <Link href="/privacy" className="hover:underline">
            {t('privacy')}
          </Link>
          <Link href="/terms" className="hover:underline">
            {t('terms')}
          </Link>
          <Link href="/refund" className="hover:underline">
            {t('refund')}
          </Link>
          <LocaleSwitcher />
        </nav>
      </div>
    </footer>
  );
}
