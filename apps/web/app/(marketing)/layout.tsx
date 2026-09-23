import Link from 'next/link';
import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { Logo } from '@/components/brand/logo';
import { SiteFooter } from '@/components/marketing/site-footer';

export default async function MarketingLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations('landing');
  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4">
        <Logo href="/" />
        <Link href="/app" className="text-sm hover:underline">
          {t('dashboard')}
        </Link>
      </header>
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
