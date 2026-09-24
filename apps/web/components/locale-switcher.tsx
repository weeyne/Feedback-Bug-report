'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { setLocale } from '@/app/actions/locale';
import { LOCALES, type AppLocale } from '@/i18n/locale';

/** `hideLabel` keeps the label for screen readers only, for pages that show their own. */
export function LocaleSwitcher({ hideLabel = false }: { hideLabel?: boolean }) {
  const t = useTranslations('common');
  const locale = useLocale();
  const [pending, start] = useTransition();
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className={hideLabel ? 'sr-only' : undefined}>{t('language')}</span>
      <select
        data-testid="locale-switcher"
        value={locale}
        disabled={pending}
        onChange={(e) => start(() => setLocale(e.target.value as AppLocale))}
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
