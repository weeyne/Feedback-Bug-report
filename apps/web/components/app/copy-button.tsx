'use client';

import { Check, Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

/**
 * Copies `text` to the clipboard. Sized for the header bar of the dark code block on the Install
 * page, which is dark in both themes, so the colours here are fixed rather than theme tokens.
 */
export function CopyButton({ text, testId }: { text: string; testId?: string }) {
  const t = useTranslations('common');
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      data-testid={testId}
      className="text-zinc-300 hover:bg-white/10 hover:text-white dark:hover:bg-white/10"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      {copied ? t('copied') : t('copy')}
    </Button>
  );
}
