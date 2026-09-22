'use client';

import { useActionState } from 'react';
import { sendMagicLink, signInWithGitHub, type LoginState } from './actions';

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(sendMagicLink, {
    status: 'idle',
  });
  if (state.status === 'sent') {
    return <p data-testid="login-sent">Check your inbox for a sign-in link.</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      <form action={signInWithGitHub}>
        <button type="submit" data-testid="login-github">
          Continue with GitHub
        </button>
      </form>
      <form action={action} className="flex flex-col gap-2">
        <input
          name="email"
          type="email"
          required
          placeholder="you@example.com"
          data-testid="login-email"
        />
        <button type="submit" disabled={pending} data-testid="login-submit">
          Email me a sign-in link
        </button>
        {state.status === 'error' && <p role="alert">{state.error}</p>}
      </form>
    </div>
  );
}
