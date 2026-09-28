import type { ReactNode } from 'react';
import { getFormatter, getTranslations } from 'next-intl/server';
import { LEGAL_CONTACT_EMAIL, LEGAL_UPDATED, type LegalDocumentId } from '@/lib/legal';

type Section = Record<string, string>;

/**
 * Renders one legal document from `legal.<doc>` messages. A section's `p*` keys are paragraphs and
 * consecutive `li*` keys form one list, in message order.
 */
export async function LegalDocument({ doc }: { doc: LegalDocumentId }) {
  const [t, format] = await Promise.all([getTranslations('legal'), getFormatter()]);
  const values = {
    email: LEGAL_CONTACT_EMAIL,
    name: t('operatorName'),
    country: t('operatorCountry'),
  };
  const sections = t.raw(`${doc}.sections`) as Record<string, Section>;

  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16" data-testid={`legal-${doc}`}>
      <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{t(`${doc}.title`)}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {t('updated', {
          date: format.dateTime(LEGAL_UPDATED, { dateStyle: 'long', timeZone: 'UTC' }),
        })}
      </p>
      <p className="mt-6 text-base leading-relaxed">{t(`${doc}.intro`)}</p>

      <section
        className="mt-8 rounded-2xl border bg-card p-5 text-sm leading-relaxed"
        data-testid="legal-operator"
      >
        <h2 className="font-extrabold">{t('operatorTitle')}</h2>
        <p className="mt-1">{t('operator', values)}</p>
        <p className="mt-1">
          {t('contact')}:{' '}
          <a
            className="font-semibold text-primary underline-offset-4 hover:underline"
            href={`mailto:${LEGAL_CONTACT_EMAIL}`}
          >
            {LEGAL_CONTACT_EMAIL}
          </a>
        </p>
      </section>

      {Object.entries(sections).map(([id, section]) => {
        const blocks: ReactNode[] = [];
        let items: ReactNode[] = [];
        const flush = () => {
          if (items.length)
            blocks.push(
              <ul key={`ul-${blocks.length}`} className="mt-3 list-disc space-y-1.5 pl-5">
                {items}
              </ul>,
            );
          items = [];
        };
        for (const key of Object.keys(section)) {
          const text = key === 'title' ? null : t(`${doc}.sections.${id}.${key}`, values);
          if (key.startsWith('li')) items.push(<li key={key}>{text}</li>);
          else if (key.startsWith('p')) {
            flush();
            blocks.push(
              <p key={key} className="mt-3">
                {text}
              </p>,
            );
          }
        }
        flush();
        return (
          <section key={id} id={id} className="mt-10 scroll-mt-24 leading-relaxed">
            <h2 className="text-xl font-extrabold tracking-tight">
              {t(`${doc}.sections.${id}.title`)}
            </h2>
            {blocks}
          </section>
        );
      })}
    </article>
  );
}
