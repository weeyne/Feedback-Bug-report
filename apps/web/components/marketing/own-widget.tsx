import Script from 'next/script';
import { getEnv } from '@/lib/env';

/** Our own Dymcode widget on the landing page; nothing renders when the project key is unset. */
export function OwnWidget() {
  const key = getEnv().NEXT_PUBLIC_DYMCODE_PROJECT_KEY;
  if (!key) return null;
  return <Script src="/w/widget.js" data-project-id={key} strategy="afterInteractive" />;
}
