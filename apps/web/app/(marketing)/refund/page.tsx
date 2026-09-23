import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('legal'))('refundTitle') };
}

export default async function RefundPage() {
  const t = await getTranslations('legal');
  return (
    <article className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-semibold">{t('refundTitle')}</h1>
      <p className="mt-2 rounded-md bg-muted px-3 py-2 text-sm">{t('draft')}</p>
      {(['refund1', 'refund2', 'refund3'] as const).map((key) => (
        <p key={key} className="mt-4">
          {t(key)}
        </p>
      ))}
    </article>
  );
}
