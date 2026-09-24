'use client';

import { useTheme } from 'next-themes';
import { useEffect, useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from 'cn';

export function runTransition(apply: () => void) {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return apply();
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  if (typeof doc.startViewTransition === 'function') {
    doc.startViewTransition(apply);
    return;
  }
  const root = document.documentElement;
  root.classList.add('theme-fading');
  apply();
  window.setTimeout(() => root.classList.remove('theme-fading'), 850);
}

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const t = useTranslations('common');
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // useId output contains ':' which is invalid inside url(#...); keep only safe characters.
  const maskId = `bp-moon-mask-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const dark = mounted && resolvedTheme === 'dark';
  if (!mounted) return <span className={cn('inline-block h-[30px] w-14', className)} aria-hidden />;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label={t('themeDark')}
      data-testid="theme-toggle"
      onClick={() => runTransition(() => setTheme(dark ? 'light' : 'dark'))}
      className={cn(
        'theme-toggle relative h-[30px] w-14 rounded-full border border-border bg-card',
        className,
      )}
      data-dark={dark}
    >
      <span className="theme-toggle-knob">
        <svg viewBox="0 0 24 24" aria-hidden>
          <mask id={maskId}>
            <rect width="24" height="24" fill="#fff" />
            <circle className="theme-toggle-cut" cx="12" cy="12" r="7" fill="#000" />
          </mask>
          <circle cx="12" cy="12" r="6" fill="#fff" mask={`url(#${maskId})`} />
          <g className="theme-toggle-rays" stroke="#fff" strokeWidth="2" strokeLinecap="round">
            <path d="M12 1.5v2M12 20.5v2M1.5 12h2M20.5 12h2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M4.6 19.4 6 18M18 6l1.4-1.4" />
          </g>
        </svg>
      </span>
    </button>
  );
}
