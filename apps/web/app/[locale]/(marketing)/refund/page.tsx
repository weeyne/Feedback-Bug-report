import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { LegalDocument } from '@/components/marketing/legal-document';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('legal'))('refund.title') };
}

export default function Page() {
  return <LegalDocument doc="refund" />;
}
