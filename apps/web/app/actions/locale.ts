'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { LOCALE_COOKIE, LOCALES, type AppLocale } from '@/i18n/locale';

export async function setLocale(locale: AppLocale): Promise<void> {
  if (!LOCALES.includes(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  });
  revalidatePath('/', 'layout');
}
