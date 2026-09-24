'use client';

import {
  CheckCheck,
  EllipsisVertical,
  Paperclip,
  Search,
  SendHorizontal,
  SmilePlus,
} from 'lucide-react';
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { cn } from 'cn';
import { LadybugMark } from '@/components/brand/logo';
import { DEMO_PROJECT_NAME } from './protocol';
import { TelegramHtml } from './telegram-html';

/**
 * A replica of a Telegram chat with the Bugping bot (Telegram Web look, sized for the demo stage's
 * 1280×720 canvas). The history is what a real connection leaves behind: the owner's `/start`
 * (read ticks) and the bot's "Connected" reply; then the report arrives as a photo with the real
 * caption (or as a text message when there is no screenshot). Telegram's own colours are literal
 * values with light/dark pairs; no Telegram assets are used.
 */
export interface TelegramChatProps {
  /** Telegram HTML, as `formatTelegram(...).full` produces it (see `demoCaption`). */
  caption: string;
  /** Object URL of the scene-1 screenshot; `null` sends the report as a text message. */
  image: string | null;
  /** Clock time of the report, e.g. "14:32". */
  time: string;
  /** Slides the report bubble in; `false` keeps it hidden (before scene 2 starts). */
  show: boolean;
  className?: string;
}

/** "14:32" → "14:30": the connection happened a little earlier than the report. */
function earlier(time: string, minutes: number): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) return time;
  const total = (Number(match[1]) * 60 + Number(match[2]) - minutes + 1440) % 1440;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

// Telegram Web's default wallpaper colours; the doodle pattern is replaced by a CSS dot grid.
const WALLPAPER_LIGHT: CSSProperties = {
  backgroundColor: '#b9cf99',
  backgroundImage: [
    'radial-gradient(circle at 1.5px 1.5px, rgba(40,70,30,.16) 1.2px, transparent 1.8px)',
    'radial-gradient(circle at 13.5px 13.5px, rgba(40,70,30,.10) 1px, transparent 1.6px)',
    'radial-gradient(ellipse 60% 70% at 12% 18%, #dbddbb 0%, transparent 70%)',
    'radial-gradient(ellipse 55% 65% at 88% 12%, #d5d88d 0%, transparent 70%)',
    'radial-gradient(ellipse 60% 70% at 82% 88%, #88b884 0%, transparent 70%)',
    'radial-gradient(ellipse 60% 70% at 15% 90%, #6ba587 0%, transparent 70%)',
  ].join(','),
  backgroundSize: '24px 24px, 24px 24px, 100% 100%, 100% 100%, 100% 100%, 100% 100%',
};
const WALLPAPER_DARK: CSSProperties = {
  backgroundColor: '#0f0f14',
  backgroundImage: [
    'radial-gradient(circle at 1.5px 1.5px, rgba(255,255,255,.07) 1.2px, transparent 1.8px)',
    'radial-gradient(circle at 13.5px 13.5px, rgba(255,255,255,.045) 1px, transparent 1.6px)',
    'radial-gradient(ellipse 60% 70% at 10% 15%, rgba(79,91,213,.35) 0%, transparent 70%)',
    'radial-gradient(ellipse 55% 65% at 90% 20%, rgba(150,47,191,.30) 0%, transparent 70%)',
    'radial-gradient(ellipse 60% 70% at 85% 90%, rgba(221,108,185,.22) 0%, transparent 70%)',
    'radial-gradient(ellipse 60% 70% at 12% 88%, rgba(254,196,150,.14) 0%, transparent 70%)',
  ].join(','),
  backgroundSize: '24px 24px, 24px 24px, 100% 100%, 100% 100%, 100% 100%, 100% 100%',
};

/** The little curved tail at the bottom corner of the last bubble in a group. */
function Tail({ side, className }: { side: 'left' | 'right'; className: string }) {
  return (
    <svg
      viewBox="0 0 9 17"
      width="9"
      height="17"
      aria-hidden="true"
      className={cn(
        'absolute bottom-0',
        side === 'left' ? '-left-[8px]' : '-right-[8px] -scale-x-100',
        className,
      )}
    >
      <path d="M9 0 V17 H1.5 C.3 17 -.2 15.8 .7 15 C5.2 11.2 8.6 6.4 9 0 Z" fill="currentColor" />
    </svg>
  );
}

const INCOMING = 'bg-white text-black dark:bg-[#212121] dark:text-white';
const INCOMING_TAIL = 'text-white dark:text-[#212121]';
const INCOMING_META = 'text-[#8a8f94] dark:text-[#8b8b8f]';

/**
 * Time (and ticks) in the bubble's bottom-right corner, like Telegram: an invisible inline spacer
 * reserves room at the end of the last line, the visible copy is pinned to the corner.
 */
function Meta({
  time,
  className,
  ticks = false,
}: {
  time: string;
  className: string;
  ticks?: boolean;
}) {
  const content = (
    <>
      {time}
      {ticks && <CheckCheck className="size-[16px]" strokeWidth={2.25} aria-hidden="true" />}
    </>
  );
  return (
    <>
      <span
        aria-hidden="true"
        className="invisible ml-[8px] inline-flex items-center gap-[2px] text-[12px] leading-none"
      >
        {content}
      </span>
      <span
        className={cn(
          'absolute right-[8px] bottom-[5px] inline-flex items-center gap-[2px] text-[12px] leading-none select-none',
          className,
        )}
      >
        {content}
      </span>
    </>
  );
}

function OutgoingText({ text, time }: { text: string; time: string }) {
  return (
    <div className="flex justify-end pr-[8px]">
      <div className="relative max-w-[480px] rounded-[15px] rounded-br-none bg-[#eeffde] px-[10px] pt-[6px] pb-[7px] text-[15px] leading-[1.3125] text-black shadow-[0_1px_2px_rgba(16,35,47,.15)] dark:bg-[#766ac8] dark:text-white">
        {text}
        <Meta time={time} ticks className="text-[#4fae4e] dark:text-white/65" />
        <Tail side="right" className="text-[#eeffde] dark:text-[#766ac8]" />
      </div>
    </div>
  );
}

function IncomingText({ children, time }: { children: ReactNode; time: string }) {
  return (
    <div className="flex justify-start pl-[8px]">
      <div
        className={cn(
          'relative max-w-[480px] rounded-[15px] rounded-bl-none px-[10px] pt-[6px] pb-[7px] text-[15px] leading-[1.3125] shadow-[0_1px_2px_rgba(16,35,47,.15)]',
          INCOMING,
        )}
      >
        {children}
        <Meta time={time} className={INCOMING_META} />
        <Tail side="left" className={INCOMING_TAIL} />
      </div>
    </div>
  );
}

const CAPTION_CLASSES = {
  link: 'text-[#3390ec] dark:text-[#8774e1]',
  code: 'font-mono text-[14px] text-[#c02d2e] dark:text-[#e57373]',
};

function Report({ caption, image, time }: Pick<TelegramChatProps, 'caption' | 'image' | 'time'>) {
  const text = (
    <div className="relative px-[10px] pt-[6px] pb-[7px] text-[15px] leading-[1.3125] break-words whitespace-normal">
      <TelegramHtml html={caption} classes={CAPTION_CLASSES} />
      <Meta time={time} className={INCOMING_META} />
    </div>
  );
  return (
    <div
      className={cn(
        'relative rounded-[15px] rounded-bl-none shadow-[0_1px_2px_rgba(16,35,47,.15)]',
        image ? 'w-[400px]' : 'max-w-[480px]',
        INCOMING,
      )}
    >
      {image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt=""
          className="block aspect-[16/9] w-full rounded-t-[15px] object-cover object-top"
        />
      )}
      {text}
      <Tail side="left" className={INCOMING_TAIL} />
    </div>
  );
}

const REPORT_GAP = 8;

export function TelegramChat({ caption, image, time, show, className }: TelegramChatProps) {
  const reportRef = useRef<HTMLDivElement>(null);
  const [reportHeight, setReportHeight] = useState(0);
  // No transitions until the report is measured, so the first paint never animates.
  const [measured, setMeasured] = useState(false);
  useLayoutEffect(() => {
    const element = reportRef.current;
    if (!element) return;
    const update = () => setReportHeight(element.offsetHeight);
    update();
    const frame = requestAnimationFrame(() => setMeasured(true));
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return (
    <div
      className={cn(
        'flex h-[720px] w-[1280px] flex-col overflow-hidden bg-white font-sans text-black antialiased dark:bg-[#212121] dark:text-white',
        className,
      )}
      style={{ fontFamily: 'Roboto, -apple-system, "Segoe UI", "Helvetica Neue", sans-serif' }}
    >
      <header className="relative z-10 flex h-[56px] shrink-0 items-center gap-[12px] bg-white px-[20px] shadow-[0_1px_3px_rgba(0,0,0,.12)] dark:bg-[#212121] dark:shadow-[0_1px_3px_rgba(0,0,0,.5)]">
        {/* No dark pair on purpose: Telegram avatars keep their colours in both app themes. */}
        <span className="flex size-[42px] items-center justify-center rounded-full bg-[#ffd9d2] text-[#1a1414]">
          <LadybugMark size={30} />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="text-[16px] leading-[1.35] font-medium">Bugping</span>
          <span className="text-[14px] leading-[1.3] text-[#707579] dark:text-[#aaaaaa]">bot</span>
        </span>
        <span className="ml-auto flex items-center gap-[4px] text-[#707579] dark:text-[#aaaaaa]">
          <span className="flex size-[40px] items-center justify-center">
            <Search className="size-[22px]" strokeWidth={1.9} aria-hidden="true" />
          </span>
          <span className="flex size-[40px] items-center justify-center">
            <EllipsisVertical className="size-[22px]" strokeWidth={1.9} aria-hidden="true" />
          </span>
        </span>
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="absolute inset-0 dark:hidden" style={WALLPAPER_LIGHT} aria-hidden="true" />
        <div
          className="absolute inset-0 hidden dark:block"
          style={WALLPAPER_DARK}
          aria-hidden="true"
        />

        <div className="relative mx-auto flex min-h-0 w-full max-w-[728px] flex-1 flex-col justify-end overflow-hidden px-[16px] pb-[8px]">
          {/* Until the report arrives, the history sits at the bottom; it moves up as it lands. */}
          <div
            className={cn(
              'flex flex-col gap-[5px] motion-reduce:transition-none',
              measured && 'transition-transform duration-300 ease-out',
            )}
            style={{ transform: `translateY(${show ? 0 : reportHeight + REPORT_GAP}px)` }}
          >
            <div className="flex justify-center">
              <span className="rounded-full bg-[#4a7a3a]/40 px-[10px] py-[3px] text-[14px] leading-[1.35] font-medium text-white dark:bg-black/40">
                Today
              </span>
            </div>
            <OutgoingText text="/start" time={earlier(time, 3)} />
            <IncomingText time={earlier(time, 3)}>✅ Connected to {DEMO_PROJECT_NAME}</IncomingText>
          </div>
          <div
            ref={reportRef}
            data-testid="telegram-report"
            className={cn(
              'flex justify-start pl-[8px] motion-reduce:translate-y-0 motion-reduce:transition-none',
              measured && 'transition-[opacity,transform] duration-300 ease-out',
              show ? 'translate-y-0 opacity-100' : 'translate-y-[16px] opacity-0',
            )}
            style={{ marginTop: REPORT_GAP }}
            aria-hidden={!show}
          >
            <Report caption={caption} image={image} time={time} />
          </div>
        </div>

        <div className="relative mx-auto flex w-full max-w-[728px] shrink-0 items-end gap-[8px] px-[16px] pb-[18px]">
          <div className="relative flex h-[54px] flex-1 items-center gap-[10px] rounded-[16px] rounded-br-none bg-white px-[14px] text-[#707579] shadow-[0_1px_2px_rgba(16,35,47,.15)] dark:bg-[#212121] dark:text-[#aaaaaa]">
            <SmilePlus className="size-[24px]" strokeWidth={1.8} aria-hidden="true" />
            <span className="flex-1 text-[16px] text-[#a2acb4] dark:text-[#707579]">Message</span>
            <Paperclip className="size-[24px]" strokeWidth={1.8} aria-hidden="true" />
            <Tail side="right" className="text-white dark:text-[#212121]" />
          </div>
          <span className="flex size-[54px] shrink-0 items-center justify-center rounded-full bg-white text-[#3390ec] shadow-[0_1px_2px_rgba(16,35,47,.15)] dark:bg-[#212121] dark:text-[#8774e1]">
            <SendHorizontal className="size-[24px]" strokeWidth={2} aria-hidden="true" />
          </span>
        </div>
      </div>
    </div>
  );
}
