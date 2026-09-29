import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { LOCALE_COOKIE, resolveLocale } from './locale';
import { TIME_ZONE_COOKIE, validTimeZone } from './time-zone';

export default getRequestConfig(async ({ requestLocale }) => {
  const jar = await cookies();
  const locale = resolveLocale({
    // Set for the public pages (the `[locale]` segment, via the proxy); undefined elsewhere.
    requested: await requestLocale,
    cookie: jar.get(LOCALE_COOKIE)?.value,
    acceptLanguage: (await headers()).get('accept-language'),
  });
  return {
    locale,
    timeZone: validTimeZone(jar.get(TIME_ZONE_COOKIE)?.value) ?? 'UTC',
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
