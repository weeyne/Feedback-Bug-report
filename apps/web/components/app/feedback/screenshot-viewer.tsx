'use client';

import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

export function ScreenshotViewer({ src }: { src: string }) {
  const t = useTranslations('feedback');
  return (
    <Dialog>
      <DialogTrigger className="mt-4 block w-full cursor-zoom-in">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={t('screenshot')} className="w-full rounded-md border" />
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
