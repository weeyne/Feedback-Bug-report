'use client';

import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

export function ScreenshotViewer({ src }: { src: string }) {
  const t = useTranslations('feedback');
  return (
    <Dialog>
      <DialogTrigger className="block w-full cursor-zoom-in overflow-hidden rounded-xl border bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={t('screenshot')}
          className="max-h-80 w-full object-cover object-top transition-opacity duration-200 hover:opacity-90"
        />
      </DialogTrigger>
      <DialogContent className="max-w-[95vw] border-none bg-transparent p-0 ring-0 sm:max-w-[95vw]">
        <DialogTitle className="sr-only">{t('screenshot')}</DialogTitle>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={t('screenshot')}
          className="mx-auto max-h-[95vh] max-w-[95vw] object-contain"
        />
      </DialogContent>
    </Dialog>
  );
}
