import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

/**
 * The public pages' locale segment. The proxy rewrites unprefixed URLs to `/en/...`; any other
 * first segment that reaches this dynamic route (an unknown URL) is a 404, not a page.
 *
 * The root layout (with `<html lang>` and its own client provider) sits above this segment and is
 * not re-rendered by a client-side navigation, so the pages get a provider of their own: client
 * components (`useLocale`, `useTranslations`, next-intl's `usePathname`) always follow the URL's
 * locale. The locale switcher still does a full navigation, which also refreshes `<html lang>`.
 */
export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  return (
    <NextIntlClientProvider locale={locale} messages={await getMessages({ locale })}>
      {children}
    </NextIntlClientProvider>
  );
}
