'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { sendMagicLink, signInWithGitHub, type LoginState } from './actions';

export function LoginForm() {
  const t = useTranslations('auth');
  const [state, action, pending] = useActionState<LoginState, FormData>(sendMagicLink, {
    status: 'idle',
  });
  if (state.status === 'sent') {
    return <p data-testid="login-sent">{t('sent')}</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      <form action={signInWithGitHub}>
        <button type="submit" data-testid="login-github">
          {t('github')}
        </button>
      </form>
      <form action={action} className="flex flex-col gap-2">
        <input
          name="email"
          type="email"
          required
          placeholder={t('emailPlaceholder')}
          data-testid="login-email"
        />
        <button type="submit" disabled={pending} data-testid="login-submit">
          {t('emailSubmit')}
        </button>
        {state.status === 'error' && state.error && (
          <p role="alert">{t(state.error.replace('auth.', ''))}</p>
        )}
      </form>
    </div>
  );
}
