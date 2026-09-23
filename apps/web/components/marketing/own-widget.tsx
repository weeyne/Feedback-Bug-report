import Script from 'next/script';
import { getPublicEnv } from '@/lib/public-env';

/** Our own Bugping widget on the landing page; nothing renders when the project key is unset. */
export function OwnWidget() {
  const key = getPublicEnv().bugpingProjectKey;
  if (!key) return null;
  return <Script src="/w/widget.js" data-project-id={key} strategy="afterInteractive" />;
}
