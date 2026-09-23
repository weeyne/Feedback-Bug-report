'use client';

import { CircleAlert, LoaderCircle, MailCheck } from 'lucide-react';
import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { sendMagicLink, signInWithGitHub, type LoginState } from './actions';

export function LoginCard({ error }: { error?: string }) {
  const [attempt, setAttempt] = useState(0);
  return (
    <Card className="w-full max-w-[360px] p-6 shadow-[0_12px_40px_rgb(26_20_20/0.06)]">
      <LoginForm
        key={attempt}
        // The page-level error (from ?error=callback|oauth) only applies to the first attempt:
        // once the user restarts with "Use a different email", it must not reappear.
        pageError={attempt === 0 ? error : undefined}
        onRestart={() => setAttempt((n) => n + 1)}
      />
    </Card>
  );
}

function LoginForm({ pageError, onRestart }: { pageError?: string; onRestart: () => void }) {
  const t = useTranslations('auth');
  const [state, action, pending] = useActionState<LoginState, FormData>(sendMagicLink, {
    status: 'idle',
  });

  if (state.status === 'sent') {
    return (
      <div data-testid="login-sent" className="flex flex-col items-center gap-3 text-center">
        <MailCheck className="size-10 text-brand" aria-hidden />
        <h1 className="text-xl font-extrabold tracking-tight">{t('sentTitle')}</h1>
        <p className="text-sm text-muted-foreground">{t('sent', { email: state.email ?? '' })}</p>
        <Button
          variant="outline"
          className="w-full"
          data-testid="login-different-email"
          onClick={onRestart}
        >
          {t('differentEmail')}
        </Button>
      </div>
    );
  }

  const message =
    state.status === 'error' && state.error ? t(state.error.replace('auth.', '')) : pageError;

  return (
    <div>
      <h1 className="text-xl font-extrabold tracking-tight">{t('title')}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
      {message && (
        <div
          role="alert"
          className="mt-4 flex gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {message}
        </div>
      )}
      <form action={signInWithGitHub} className="mt-5">
        <Button
          type="submit"
          size="lg"
          className="h-10 w-full bg-foreground text-background hover:bg-foreground/90"
          data-testid="login-github"
        >
          <svg viewBox="0 0 16 16" className="size-4" fill="currentColor" aria-hidden>
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38v-1.33c-2.23.48-2.7-1.07-2.7-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.06-.49.06-.49.8.06 1.23.83 1.23.83.72 1.22 1.87.87 2.33.66.07-.52.28-.87.5-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
          </svg>
          {t('github')}
        </Button>
      </form>
      <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        {t('orEmail')}
        <span className="h-px flex-1 bg-border" />
      </div>
      <form action={action} className="flex flex-col gap-2">
        <Label htmlFor="login-email">{t('emailLabel')}</Label>
        <Input
          id="login-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder={t('emailPlaceholder')}
          className="h-10"
          data-testid="login-email"
        />
        <Button
          type="submit"
          size="lg"
          className="mt-1 h-10 w-full"
          disabled={pending}
          data-testid="login-submit"
        >
          {pending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
          {t('emailSubmit')}
        </Button>
      </form>
      <p className="mt-4 text-center text-xs text-muted-foreground">{t('noPassword')}</p>
    </div>
  );
}
