import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { LOCALE_COOKIE, pickLocale } from './locale';
import { TIME_ZONE_COOKIE, validTimeZone } from './time-zone';

export default getRequestConfig(async () => {
  const jar = await cookies();
  const locale = pickLocale(
    jar.get(LOCALE_COOKIE)?.value,
    (await headers()).get('accept-language'),
  );
  return {
    locale,
    timeZone: validTimeZone(jar.get(TIME_ZONE_COOKIE)?.value) ?? 'UTC',
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
