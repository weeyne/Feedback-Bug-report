import { AppLink } from '@/components/app/link-prefetch';
import { useId } from 'react';
import { cn } from 'cn';

export function LadybugMark({ size = 28, className }: { size?: number; className?: string }) {
  // useId output contains ':' which is invalid inside url(#...); keep only safe characters.
  const gradient = `lb-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      className={cn('shrink-0', className)}
    >
      <defs>
        <radialGradient id={gradient} cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor="#ff7a6b" />
          <stop offset=".55" stopColor="#ff4d3d" />
          <stop offset="1" stopColor="#d9321f" />
        </radialGradient>
      </defs>
      <g stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" fill="none">
        <path d="M14 28 L6 24" />
        <path d="M12 38 L4 39" />
        <path d="M15 48 L8 54" />
        <path d="M50 28 L58 24" />
        <path d="M52 38 L60 39" />
        <path d="M49 48 L56 54" />
        <path d="M27 12 Q23 4 17 4" />
        <path d="M37 12 Q41 4 47 4" />
      </g>
      <circle cx="17" cy="4.2" r="2.3" fill="currentColor" />
      <circle cx="47" cy="4.2" r="2.3" fill="currentColor" />
      <path d="M21 17 a11 9 0 0 1 22 0 z" fill="#1a1414" stroke="currentColor" strokeWidth="1" />
      <circle cx="27.5" cy="13.5" r="2" fill="#fff" />
      <circle cx="36.5" cy="13.5" r="2" fill="#fff" />
      <path
        d="M32 18 C14 18 10 32 10 38 C10 51 20 59 31 59.5 L32 20 Z"
        fill={`url(#${gradient})`}
      />
      <path
        d="M32 18 C50 18 54 32 54 38 C54 51 44 59 33 59.5 L32 20 Z"
        fill={`url(#${gradient})`}
      />
      <path d="M22 19 Q32 15 42 19 Q37 23 32 23 Q27 23 22 19Z" fill="#1a1414" />
      <ellipse cx="25" cy="20" rx="2.6" ry="1.4" fill="#fff" opacity=".9" />
      <ellipse cx="39" cy="20" rx="2.6" ry="1.4" fill="#fff" opacity=".9" />
      <path d="M32 21 L32 59.5" stroke="#1a1414" strokeWidth="1.6" />
      <circle cx="21" cy="31" r="4" fill="#1a1414" />
      <circle cx="43" cy="31" r="4" fill="#1a1414" />
      <circle cx="17.5" cy="43" r="3.2" fill="#1a1414" />
      <circle cx="46.5" cy="43" r="3.2" fill="#1a1414" />
      <circle cx="25.5" cy="51" r="2.8" fill="#1a1414" />
      <circle cx="38.5" cy="51" r="2.8" fill="#1a1414" />
      <circle cx="27" cy="40" r="2.2" fill="#1a1414" />
      <circle cx="37" cy="40" r="2.2" fill="#1a1414" />
      <ellipse
        cx="20"
        cy="26"
        rx="5"
        ry="2.6"
        fill="#fff"
        opacity=".35"
        transform="rotate(-35 20 26)"
      />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="Bugping"
      className={cn('font-extrabold tracking-[-0.03em] leading-none', className)}
    >
      <span aria-hidden="true">
        bugp
        <span className="relative">
          ı
          <span className="absolute left-1/2 top-[0.25em] size-[0.20em] -translate-x-1/2 rounded-full bg-brand" />
        </span>
        ng
      </span>
    </span>
  );
}

const SIZES = {
  md: { mark: 28, text: 'text-xl' },
  lg: { mark: 40, text: 'text-3xl' },
} as const;

export function Logo({
  size = 'md',
  href,
  className,
}: {
  size?: 'md' | 'lg';
  href?: string;
  className?: string;
}) {
  const s = SIZES[size];
  const content = (
    <>
      <LadybugMark size={s.mark} />
      <Wordmark className={s.text} />
    </>
  );
  const classes = cn('inline-flex items-center gap-2 text-foreground', className);
  return href ? (
    <AppLink href={href} className={classes}>
      {content}
    </AppLink>
  ) : (
    <span className={classes}>{content}</span>
  );
}
