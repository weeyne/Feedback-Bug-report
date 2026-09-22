import { getTranslations } from 'next-intl/server';
import { signOut } from '@/app/actions/session';
import { DeleteAccount } from '@/components/app/account/delete-account';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { Button } from '@/components/ui/button';
import { requireUser } from '@/lib/auth/session';

export default async function AccountPage() {
  const user = await requireUser();
  const t = await getTranslations();
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">{t('account.title')}</h1>
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">{t('account.email')}</span>
        <span data-testid="account-email">{user.email}</span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">{t('account.language')}</span>
        <LocaleSwitcher />
      </div>
      <form action={signOut}>
        <Button type="submit" variant="outline">
          {t('auth.signOut')}
        </Button>
      </form>
      <DeleteAccount />
    </div>
  );
}
