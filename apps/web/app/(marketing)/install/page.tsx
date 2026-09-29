import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { cn } from 'cn';
import { PlatformGuides } from '@/components/install/platform-guides';
import { buttonVariants } from '@/components/ui/button';
import { getPublicEnv } from '@/lib/public-env';
import { installSnippet, PLACEHOLDER_KEY, widgetSrc } from '@/lib/widget/snippet';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('installGuide');
  return { title: t('title'), description: t('metaDescription') };
}

export default async function Page() {
  const t = await getTranslations('installGuide');
  const { appUrl } = getPublicEnv();
  const snippet = installSnippet(appUrl, PLACEHOLDER_KEY);
  const nextSnippet = `import Script from 'next/script';\n\n<Script src="${widgetSrc(appUrl)}" data-project-id="${PLACEHOLDER_KEY}" strategy="afterInteractive" />`;
  return (
    <article
      className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16"
      data-testid="install-guide-page"
    >
      <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{t('title')}</h1>
      <p className="mt-6 text-base leading-relaxed text-pretty">{t('intro')}</p>
      <div className="mt-8">
        <PlatformGuides snippet={snippet} nextSnippet={nextSnippet} />
      </div>
      <p className="mt-6 text-sm leading-relaxed text-pretty text-muted-foreground">
        {t('keyNote')}
      </p>
      <Link
        href="/login"
        className={cn(buttonVariants({ size: 'lg' }), 'mt-6 h-11 px-6 text-base font-semibold')}
      >
        {t('cta')}
      </Link>
    </article>
  );
}
