import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { LoginForm } from './login-form';

export default async function LoginPage() {
  if (await getSessionUser()) redirect('/app');
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">Sign in to Dymcode</h1>
      <LoginForm />
    </main>
  );
}
