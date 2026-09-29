'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { setLocale } from '@/app/actions/locale';
import { LOCALES, type AppLocale } from '@/i18n/locale';
import { getPathname, usePathname } from '@/i18n/navigation';

/**
 * `hideLabel` keeps the label for screen readers only, for pages that show their own.
 *
 * `publicPage` (the pages with localized URLs): switching opens the same page in the other
 * locale's URL (`/install` ↔ `/ru/install`), keeping the query string and hash. It is a full
 * document navigation: the root layout (`<html lang>`, its client messages) is shared by both
 * locales and a client-side navigation would not re-render it. The target always carries the
 * locale prefix (`/en/install` for English), so the proxy stores the chosen locale in the cookie
 * and, for English, redirects to the unprefixed URL. Elsewhere the `setLocale` action sets the
 * cookie and the page re-renders in place.
 */
export function LocaleSwitcher({
  hideLabel = false,
  publicPage = false,
}: {
  hideLabel?: boolean;
  publicPage?: boolean;
}) {
  const t = useTranslations('common');
  const locale = useLocale();
  const pathname = usePathname();
  const [pending, start] = useTransition();

  const change = (next: AppLocale) => {
    if (!publicPage) {
      start(() => setLocale(next));
      return;
    }
    const target = getPathname({ href: pathname, locale: next, forcePrefix: true });
    window.location.assign(`${target}${window.location.search}${window.location.hash}`);
  };

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className={hideLabel ? 'sr-only' : undefined}>{t('language')}</span>
      <select
        data-testid="locale-switcher"
        value={locale}
        disabled={pending}
        onChange={(e) => change(e.target.value as AppLocale)}
        className="rounded-md border bg-background px-2 py-1"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {l === 'en' ? 'English' : 'Русский'}
          </option>
        ))}
      </select>
    </label>
  );
}
