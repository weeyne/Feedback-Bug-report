import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale } from 'next-intl/server';
import { Toaster } from '@/components/ui/sonner';
import './globals.css';

export const metadata = { title: 'Dymcode' };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
        <Toaster />
      </body>
    </html>
  );
}
