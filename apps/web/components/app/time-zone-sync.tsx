'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { TIME_ZONE_COOKIE } from '@/i18n/time-zone';

/** Tells the server the browser's time zone (dates render server-side) and refreshes once when it changes. */
export function TimeZoneSync() {
  const router = useRouter();
  useEffect(() => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!zone) return;
    const current = document.cookie
      .split('; ')
      .find((c) => c.startsWith(`${TIME_ZONE_COOKIE}=`))
      ?.slice(TIME_ZONE_COOKIE.length + 1);
    if (current === zone) return;
    const secure = location.protocol === 'https:' ? '; secure' : '';
    document.cookie = `${TIME_ZONE_COOKIE}=${zone}; path=/; max-age=31536000; samesite=lax${secure}`;
    router.refresh();
  }, [router]);
  return null;
}
