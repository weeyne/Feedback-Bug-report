import { getTranslations } from 'next-intl/server';

// Placeholder until the Overview page lands; the project layout already checks access.
export default async function OverviewPage() {
  const t = await getTranslations('nav');
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-extrabold tracking-tight">{t('overview')}</h1>
    </div>
  );
}
