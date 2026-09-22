import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getSessionUser } from '@/lib/auth/session';
import { LoginForm } from './login-form';

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
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      {params.error === 'callback' && <p role="alert">{t('callbackFailed')}</p>}
      {params.error === 'oauth' && <p role="alert">{t('oauthFailed')}</p>}
      <LoginForm />
    </main>
  );
}
