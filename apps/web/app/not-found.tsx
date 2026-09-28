import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { StatusPage } from '@/components/status-page';
import { buttonVariants } from '@/components/ui/button';

export default async function NotFound() {
  const t = await getTranslations('status');
  return (
    <StatusPage code="404" title={t('notFoundTitle')} body={t('notFoundBody')}>
      <Link href="/app" className={buttonVariants({ size: 'lg' })}>
        {t('dashboard')}
      </Link>
      <Link href="/" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
        {t('home')}
      </Link>
    </StatusPage>
  );
}
