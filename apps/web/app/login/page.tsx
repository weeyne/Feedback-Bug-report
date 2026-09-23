import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Logo } from '@/components/brand/logo';
import { getSessionUser } from '@/lib/auth/session';
import { LoginCard } from './login-form';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  if (await getSessionUser()) redirect('/app');
  const t = await getTranslations('auth');
  const params = await searchParams;
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-8 bg-muted bg-[radial-gradient(var(--input)_1px,transparent_1px)] bg-size-[18px_18px] p-4">
      <Link
        href="/"
        data-testid="login-back"
        className="absolute left-4 top-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t('backToSite')}
      </Link>
      <Logo size="lg" href="/" />
      <LoginCard
        error={
          params.error === 'callback'
            ? t('callbackFailed')
            : params.error === 'oauth'
              ? t('oauthFailed')
              : undefined
        }
      />
    </main>
  );
}
