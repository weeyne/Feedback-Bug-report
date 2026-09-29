import { CopyButton } from '@/components/app/copy-button';

/** Code sample in a dark block (dark in both themes on purpose) with a copy button. */
export function CodeBlock({
  code,
  label,
  testId,
}: {
  code: string;
  label: string;
  testId?: string;
}) {
  return (
    <div className="min-w-0 overflow-hidden rounded-lg bg-zinc-950 font-mono text-zinc-100">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 py-1 pr-1 pl-3">
        <span className="text-[11px] tracking-wide text-zinc-400 uppercase">{label}</span>
        <CopyButton text={code} />
      </div>
      <pre className="overflow-x-auto p-3 text-xs leading-relaxed" data-testid={testId}>
        {code}
      </pre>
    </div>
  );
}
