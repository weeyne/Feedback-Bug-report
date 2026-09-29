import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { LegalDocument } from '@/components/marketing/legal-document';
import { pageLocale, publicPageMetadata } from '@/i18n/public-metadata';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const locale = await pageLocale(params);
  const t = await getTranslations({ locale, namespace: 'legal' });
  return publicPageMetadata('/refund', locale, { title: t('refund.title') });
}

export default function Page() {
  return <LegalDocument doc="refund" />;
}
