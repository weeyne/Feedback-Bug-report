import { LogOut } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { signOut } from '@/app/actions/session';
import { DeleteAccount } from '@/components/app/account/delete-account';
import { PageHeader, SectionCard } from '@/components/app/page-header';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { Button } from '@/components/ui/button';
import { requireUser } from '@/lib/auth/session';

export default async function AccountPage() {
  const user = await requireUser();
  const t = await getTranslations();
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-4 md:p-6">
      <PageHeader title={t('account.title')} description={t('account.description')} />
      <SectionCard index={0} title={t('account.profile')}>
        <dl className="flex flex-col divide-y text-sm">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 pb-3">
            <dt className="text-muted-foreground">{t('account.email')}</dt>
            <dd className="min-w-0 font-semibold break-all" data-testid="account-email">
              {user.email}
            </dd>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 pt-3">
            <dt className="text-muted-foreground">{t('account.language')}</dt>
            <dd>
              <LocaleSwitcher hideLabel />
            </dd>
          </div>
        </dl>
        <form action={signOut} className="border-t pt-4">
          <Button type="submit" variant="outline">
            <LogOut aria-hidden />
            {t('auth.signOut')}
          </Button>
        </form>
      </SectionCard>
      <DeleteAccount index={1} />
    </div>
  );
}
