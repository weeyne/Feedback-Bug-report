import { ChevronDown } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { CodeBlock } from './code-block';

const PLATFORMS = [
  { id: 'html', steps: 3, note: false, next: false },
  { id: 'wordpress', steps: 3, note: true, next: false },
  { id: 'shopify', steps: 3, note: true, next: false },
  { id: 'tilda', steps: 3, note: true, next: false },
  { id: 'nextjs', steps: 2, note: false, next: true },
] as const;

/** Per-platform install instructions as a native `<details>` accordion: works without JS. */
export async function PlatformGuides({
  snippet,
  nextSnippet,
}: {
  snippet: string;
  nextSnippet: string;
}) {
  const t = await getTranslations('installGuide');
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="install-guides">
      {PLATFORMS.map((platform) => (
        <details
          key={platform.id}
          open={platform.id === 'html'}
          className="group min-w-0 rounded-xl border bg-card open:shadow-sm"
          data-testid={`install-guide-${platform.id}`}
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-xl px-4 py-3 text-left font-bold outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
            {t(`${platform.id}.title`)}
            <ChevronDown
              aria-hidden
              className="size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
            />
          </summary>
          <div className="flex min-w-0 flex-col gap-4 px-4 pb-4">
            <ol className="flex flex-col gap-2.5 text-sm">
              {Array.from({ length: platform.steps }, (_, i) => (
                <li key={i} className="flex min-w-0 gap-3">
                  <span
                    className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-extrabold text-primary-foreground"
                    aria-hidden
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 pt-0.5 text-pretty">
                    {t(`${platform.id}.step${i + 1}`)}
                  </span>
                </li>
              ))}
            </ol>
            <CodeBlock
              code={platform.next ? nextSnippet : snippet}
              label={platform.next ? 'Next.js' : 'HTML'}
              testId={`install-guide-${platform.id}-code`}
            />
            {platform.note ? (
              <p className="text-sm text-pretty text-muted-foreground">
                {t(`${platform.id}.note`)}
              </p>
            ) : null}
          </div>
        </details>
      ))}
      <p className="text-sm text-pretty text-muted-foreground">{t('allowedHint')}</p>
    </div>
  );
}
