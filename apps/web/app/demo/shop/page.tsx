import { BRAND, buildBadgeUrl } from '@bugping/shared/brand';
import { Heart, Search, ShieldCheck, ShoppingBag, Star, Truck } from 'lucide-react';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { DEMO_PAY_ID, DEMO_PROJECT_KEY } from '@/components/marketing/demo/protocol';
import { ShopSneaker } from '@/components/marketing/demo/shop-sneaker';
import { ShopWidget } from '@/components/marketing/demo/shop-widget';
import type { AppLocale } from '@/i18n/locale';
import { getPublicEnv } from '@/lib/public-env';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('demoShop');
  return { title: { absolute: t('metaTitle') }, robots: { index: false, follow: false } };
}

const SIZES = ['40', '41', '42', '43', '44', '45'];
const SELECTED_SIZE = '42';
const SOLD_OUT_SIZE = '45';
const SWATCHES = [
  'bg-indigo-600 dark:bg-indigo-500',
  'bg-zinc-200 dark:bg-zinc-300',
  'bg-emerald-600 dark:bg-emerald-500',
];

/**
 * A fake third-party store ("Nova Shop") shown in the landing demo's iframe: the real widget is
 * mounted on it by `ShopWidget`. Static apart from the locale; never touches the database or any API.
 */
export default async function DemoShopPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const t = await getTranslations('demoShop');
  const locale = (await getLocale()) as AppLocale;
  const staticFrame = (await searchParams).static === '1';
  // The widget only shows an https badge link; local dev falls back to the public site.
  const appUrl = getPublicEnv().appUrl;
  const badgeUrl = buildBadgeUrl(
    DEMO_PROJECT_KEY,
    appUrl.startsWith('https://') ? appUrl : BRAND.url,
  );

  return (
    <div className="min-h-screen overflow-x-hidden bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-6">
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-full bg-zinc-900 text-sm font-extrabold text-white dark:bg-white dark:text-zinc-900">
              N
            </span>
            <span className="text-lg font-extrabold tracking-tight">{t('brand')}</span>
          </div>
          <nav className="hidden items-center gap-7 text-sm font-medium text-zinc-600 md:flex dark:text-zinc-300">
            <span>{t('navNew')}</span>
            <span>{t('navMen')}</span>
            <span>{t('navWomen')}</span>
            <span className="text-rose-600 dark:text-rose-400">{t('navSale')}</span>
          </nav>
          <div className="flex items-center gap-4 text-zinc-700 dark:text-zinc-200">
            <Search className="size-5" aria-label={t('search')} />
            <span className="relative">
              <ShoppingBag className="size-5" aria-label={t('cart')} />
              <span className="absolute -right-2 -top-2 grid size-4 place-items-center rounded-full bg-zinc-900 text-[10px] font-bold text-white dark:bg-white dark:text-zinc-900">
                1
              </span>
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-4">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {t('crumbHome')} <span aria-hidden>/</span> {t('crumbSneakers')}{' '}
          <span aria-hidden>/</span>{' '}
          <span className="text-zinc-800 dark:text-zinc-200">{t('crumbCheckout')}</span>
        </p>

        <div className="mt-4 grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <section className="order-2 flex min-w-0 flex-col gap-4 md:order-1">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight">{t('productTitle')}</h1>
              <div className="mt-2 flex items-center gap-1 text-amber-500 dark:text-amber-400">
                {[0, 1, 2, 3, 4].map((i) => (
                  <Star key={i} className="size-4 fill-current" aria-hidden />
                ))}
                <span className="ml-1 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                  4.8
                </span>
              </div>
            </div>
            <div className="flex items-baseline gap-3">
              <span className="text-2xl font-bold">{t('price')}</span>
              <span className="text-sm text-zinc-400 line-through dark:text-zinc-500">
                {t('oldPrice')}
              </span>
              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                −19%
              </span>
            </div>
            <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              {t('productBody')}
            </p>

            <div>
              <p className="text-sm">
                <span className="text-zinc-500 dark:text-zinc-400">{t('colorLabel')}:</span>{' '}
                <span className="font-semibold">{t('colorValue')}</span>
              </p>
              <div className="mt-2 flex gap-2">
                {SWATCHES.map((swatch, i) => (
                  <span
                    key={swatch}
                    className={`size-7 rounded-full ${swatch} ${
                      i === 0
                        ? 'ring-2 ring-zinc-900 ring-offset-2 ring-offset-zinc-50 dark:ring-white dark:ring-offset-zinc-950'
                        : ''
                    }`}
                  />
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-500 dark:text-zinc-400">{t('sizeLabel')}</span>
                <span className="text-xs text-zinc-500 underline underline-offset-2 dark:text-zinc-400">
                  {t('sizeGuide')}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-6 gap-2">
                {SIZES.map((size) => (
                  <span
                    key={size}
                    className={`grid h-10 place-items-center rounded-lg border text-sm font-semibold ${
                      size === SELECTED_SIZE
                        ? 'border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-900'
                        : size === SOLD_OUT_SIZE
                          ? 'border-zinc-200 text-zinc-300 line-through dark:border-zinc-800 dark:text-zinc-600'
                          : 'border-zinc-300 bg-white text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200'
                    }`}
                  >
                    {size}
                  </span>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-sm font-bold">{t('summaryTitle')}</p>
              <dl className="mt-2 space-y-1 text-sm">
                <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
                  <dt>{t('subtotal')}</dt>
                  <dd>{t('price')}</dd>
                </div>
                <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
                  <dt>{t('shipping')}</dt>
                  <dd className="text-emerald-600 dark:text-emerald-400">{t('shippingFree')}</dd>
                </div>
                <div className="flex justify-between border-t border-zinc-200 pt-2 font-bold dark:border-zinc-800">
                  <dt>{t('total')}</dt>
                  <dd>{t('price')}</dd>
                </div>
              </dl>
              <button
                id={DEMO_PAY_ID}
                type="button"
                className="mt-3 h-12 w-full rounded-xl bg-zinc-900 text-base font-bold text-white shadow-sm dark:bg-white dark:text-zinc-900"
              >
                {t('pay')}
              </button>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                <span className="flex items-center gap-1">
                  <ShieldCheck className="size-3.5" aria-hidden />
                  {t('secure')}
                </span>
                <span className="flex items-center gap-1">
                  <Truck className="size-3.5" aria-hidden />
                  {t('delivery')}
                </span>
              </div>
            </div>
          </section>

          <section className="relative order-1 grid aspect-[4/3] min-w-0 place-items-center overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-50 via-white to-zinc-100 md:order-2 md:aspect-auto md:h-[540px] dark:from-indigo-950/60 dark:via-zinc-900 dark:to-zinc-900">
            <span className="absolute left-5 top-5 rounded-full bg-white px-3 py-1 text-xs font-bold text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100">
              {t('badge')}
            </span>
            <span className="absolute right-5 top-5 grid size-9 place-items-center rounded-full bg-white text-zinc-700 shadow-sm dark:bg-zinc-800 dark:text-zinc-200">
              <Heart className="size-4" aria-hidden />
            </span>
            <div className="relative w-[82%] -rotate-3">
              <ShopSneaker className="relative z-10 w-full drop-shadow-xl" />
              <span className="absolute inset-x-[12%] -bottom-4 h-6 rounded-[50%] bg-zinc-900/15 blur-md dark:bg-black/50" />
            </div>
          </section>
        </div>
      </main>

      <ShopWidget locale={locale} badgeUrl={badgeUrl} staticFrame={staticFrame} />
    </div>
  );
}
