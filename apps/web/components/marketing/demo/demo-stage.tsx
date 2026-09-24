'use client';

import { DEMO_SELECTORS } from '@bugping/widget/demo-selectors';
import { Play } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from 'react';
import { cn } from 'cn';
import { Button } from '@/components/ui/button';
import type { AppLocale } from '@/i18n/locale';
import { installFocusGuard } from './focus-guard';
import { loadDemoRuntime, type DemoRuntime } from './demo-runtime';
import {
  createDirector,
  FADE_MS,
  RESET_TIMEOUT_MS,
  type DemoScene,
  type Director,
  type DirectorStage,
} from './director';
import { DEMO_MESSAGE, type DemoScreenshotMessage } from './protocol';
import type { SubmittedMessage } from './shop-bridge';
import {
  appHost,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  canvasScale,
  classifyStageMessage,
  clockTime,
  DASHBOARD_PATH,
  dashboardSrc,
  SCENE_LABEL_KEY,
  sceneUrl,
  SHOP_PATH,
  SHOP_STATIC_PATH,
} from './stage-model';
import { TelegramChat } from './telegram-chat';

/**
 * The landing's live product demo (spec §2): the real widget on a fake store, the Telegram
 * replica and the real dashboard, played by the director inside a scaled 1280×720 browser frame.
 * Decorative for assistive technology (aria-hidden + inert); a visually hidden paragraph
 * describes it instead.
 */

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia?.(REDUCED_MOTION);
  query?.addEventListener('change', onChange);
  return () => query?.removeEventListener('change', onChange);
}
const reducedMotionNow = () => window.matchMedia?.(REDUCED_MOTION).matches ?? false;

function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, reducedMotionNow, () => false);
}

/** Where the drawn cursor rests before the first move (canvas px). */
const CURSOR_HOME = { x: 760, y: 520 };
/** Scene 2's report bubble slides in this long after the scene switch (spec §2.5). */
const TELEGRAM_BUBBLE_DELAY_MS = 300;
const RIPPLE_MS = 300;
/** Static frames: how long to look for the static store's capture (attempts × interval). */
const STATIC_SHOT_ATTEMPTS = 50;
const STATIC_SHOT_POLL_MS = 200;

/** The 1280×720 logical canvas, scaled to the container width; the container keeps 16:9. */
function ScaledCanvas({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => setScale(canvasScale(element.clientWidth));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className="relative aspect-video w-full overflow-clip bg-background"
      style={{ contain: 'strict' }}
    >
      <div
        className="absolute top-0 left-0 origin-top-left"
        style={{
          width: CANVAS_WIDTH,
          height: CANVAS_HEIGHT,
          transform: `scale(${scale})`,
          visibility: scale ? undefined : 'hidden',
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** Scene label chip + browser window (traffic lights, URL bar) around a scaled canvas. */
function BrowserFrame({
  scene,
  host,
  children,
}: {
  scene: DemoScene;
  host: string;
  children?: ReactNode;
}) {
  const t = useTranslations('landing.demo');
  return (
    <div aria-hidden="true" inert className="pointer-events-none flex flex-col gap-3 select-none">
      <div className="flex justify-center">
        <span
          key={scene}
          className="animate-fade inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-semibold text-card-foreground shadow-sm sm:text-sm"
        >
          <span className="size-1.5 rounded-full bg-primary" />
          {t(SCENE_LABEL_KEY[scene])}
        </span>
      </div>
      <div className="overflow-clip rounded-2xl border bg-card shadow-xl">
        <div className="flex h-7 items-center gap-3 border-b bg-muted/60 px-3 sm:h-10 sm:px-4">
          {/* macOS window controls keep their colours in both themes. */}
          <span className="flex shrink-0 gap-1 sm:gap-1.5">
            <span className="size-2 rounded-full bg-[#ff5f57] sm:size-3 dark:bg-[#ff5f57]" />
            <span className="size-2 rounded-full bg-[#febc2e] sm:size-3 dark:bg-[#febc2e]" />
            <span className="size-2 rounded-full bg-[#28c840] sm:size-3 dark:bg-[#28c840]" />
          </span>
          <span className="mx-auto w-full max-w-md min-w-0 truncate rounded-md bg-background px-3 py-0.5 text-center text-[10px] text-muted-foreground sm:py-1 sm:text-xs">
            {sceneUrl(scene, host)}
          </span>
          <span className="w-6 shrink-0 sm:w-12" />
        </div>
        <ScaledCanvas>{children}</ScaledCanvas>
      </div>
    </div>
  );
}

/** A classic arrow pointer; its tip is at (0, 0). */
function CursorArrow() {
  return (
    <svg width="22" height="30" viewBox="0 0 22 30" className="block drop-shadow-md">
      <path
        d="M1 1 L1 24 L7 18.5 L11 28 L15 26.3 L11 17 L19 17 Z"
        fill="#111"
        stroke="#fff"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface TelegramState {
  caption: string;
  image: string | null;
  time: string;
}

interface LiveStageProps {
  runtime: DemoRuntime;
  locale: AppLocale;
  host: string;
  /** False plays one loop and keeps the final scene (the reduced-motion "Play demo"). */
  loop: boolean;
  /** In the viewport and the page is visible; otherwise the director is paused. */
  active: boolean;
  onFallback(): void;
  onDone(): void;
}

/** The playing stage: iframes, Telegram replica, drawn cursor and the director. */
function LiveStage({ runtime, locale, host, loop, active, onFallback, onDone }: LiveStageProps) {
  const [scene, setScene] = useState<DemoScene | null>(null);
  const [label, setLabel] = useState<DemoScene>('site');
  const [shopKey, setShopKey] = useState(0);
  const [dashboard, setDashboard] = useState<{ key: number; src: string } | null>(null);
  const [telegram, setTelegram] = useState<TelegramState | null>(null);
  const [telegramShow, setTelegramShow] = useState(false);

  const shopRef = useRef<HTMLIFrameElement>(null);
  const dashboardRef = useRef<HTMLIFrameElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const rippleRef = useRef<HTMLSpanElement>(null);
  const directorRef = useRef<Director | null>(null);
  const activeRef = useRef(active);
  const callbacks = useRef({ onFallback, onDone });
  useEffect(() => {
    callbacks.current = { onFallback, onDone };
  });

  useEffect(() => {
    const origin = window.location.origin;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const later = (run: () => void, ms: number) => {
      const handle = setTimeout(() => {
        timers.delete(handle);
        run();
      }, ms);
      timers.add(handle);
    };
    let director: Director | null = null;
    let onSubmitted: ((message: SubmittedMessage) => void) | null = null;
    let onShopReady: (() => void) | null = null;
    let onDashboardReady: (() => void) | null = null;
    let screenshot: Blob | null = null;
    let imageUrl: string | null = null;

    const revokeImage = () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      imageUrl = null;
    };
    const placeCursor = (x: number, y: number, ms: number) => {
      const cursor = cursorRef.current;
      if (!cursor) return;
      cursor.style.transition =
        ms > 0 && !reducedMotionNow()
          ? `transform ${ms}ms ${ms >= 200 ? 'cubic-bezier(.4,0,.2,1)' : 'linear'}`
          : 'none';
      cursor.style.transform = `translate(${x}px, ${y}px)`;
    };
    placeCursor(CURSOR_HOME.x, CURSOR_HOME.y, 0);

    const stage: DirectorStage = {
      moveCursor: placeCursor,
      press() {
        if (reducedMotionNow()) return;
        rippleRef.current?.animate(
          [
            { transform: 'scale(0.2)', opacity: 0.6 },
            { transform: 'scale(1)', opacity: 0 },
          ],
          { duration: RIPPLE_MS, easing: 'ease-out' },
        );
      },
      showScene(next) {
        setScene(next);
        setLabel(next);
        if (next === 'telegram') later(() => setTelegramShow(true), TELEGRAM_BUBBLE_DELAY_MS);
      },
      waitSubmitted() {
        return new Promise((resolve) => {
          onSubmitted = (message) => {
            revokeImage();
            screenshot = message.screenshot;
            imageUrl = screenshot ? URL.createObjectURL(screenshot) : null;
            setTelegramShow(false);
            setTelegram({
              caption: runtime.caption(message.payload),
              image: imageUrl,
              time: clockTime(new Date()),
            });
            resolve(message);
          };
        });
      },
      prepareDashboard(report) {
        return new Promise((resolve) => {
          screenshot = report.screenshot;
          onDashboardReady = resolve;
          const src = dashboardSrc(runtime.encode(report.payload));
          setDashboard((current) => ({ key: (current?.key ?? 0) + 1, src }));
        });
      },
      reset() {
        setScene(null);
        return new Promise((resolve) => {
          later(() => {
            revokeImage();
            screenshot = null;
            onSubmitted = null;
            onDashboardReady = null;
            setTelegram(null);
            setTelegramShow(false);
            setDashboard(null);
            placeCursor(CURSOR_HOME.x, CURSOR_HOME.y, 0);
            onShopReady = resolve;
            setShopKey((key) => key + 1);
          }, FADE_MS);
        });
      },
      fallback: () => callbacks.current.onFallback(),
      done: () => callbacks.current.onDone(),
    };

    // The shop must report ready in time, or the landing shows the static frames instead.
    const firstReady = setTimeout(() => {
      console.warn('[demo] the demo store did not load; showing the static frames');
      callbacks.current.onFallback();
    }, RESET_TIMEOUT_MS);

    const onMessage = (event: MessageEvent) => {
      const kind = classifyStageMessage(event, origin, {
        shop: shopRef.current?.contentWindow ?? null,
        dashboard: dashboardRef.current?.contentWindow ?? null,
      });
      if (kind === 'shop-ready') {
        if (director) {
          const resolve = onShopReady;
          onShopReady = null;
          resolve?.();
          return;
        }
        clearTimeout(firstReady);
        director = createDirector({
          frame: () => shopRef.current?.contentWindow ?? null,
          stage,
          locale,
          loop,
        });
        directorRef.current = director;
        director.start();
        if (!activeRef.current) director.pause();
      } else if (kind === 'submitted') {
        const resolve = onSubmitted;
        onSubmitted = null;
        resolve?.(event.data as SubmittedMessage);
      } else if (kind === 'dashboard-ready') {
        // Every ready (a dev StrictMode remount posts it twice) gets the screenshot.
        if (screenshot) {
          const message: DemoScreenshotMessage = {
            type: DEMO_MESSAGE.screenshot,
            blob: screenshot,
          };
          (event.source as Window).postMessage(message, origin);
        }
        const resolve = onDashboardReady;
        onDashboardReady = null;
        resolve?.();
      }
    };
    window.addEventListener('message', onMessage);

    return () => {
      window.removeEventListener('message', onMessage);
      clearTimeout(firstReady);
      for (const handle of timers) clearTimeout(handle);
      timers.clear();
      director?.stop();
      directorRef.current = null;
      revokeImage();
    };
  }, [runtime, locale, loop]);

  useEffect(() => {
    activeRef.current = active;
    const director = directorRef.current;
    if (active) director?.resume();
    else director?.pause();
  }, [active]);

  const sceneProps = (name: DemoScene) => ({
    'data-scene': name,
    'data-testid': scene === name ? 'demo-scene' : undefined,
    className: cn(
      'absolute inset-0 transition-opacity duration-500 ease-out motion-reduce:transition-none',
      scene === name ? 'opacity-100' : 'opacity-0',
    ),
  });

  return (
    <BrowserFrame scene={label} host={host}>
      <div {...sceneProps('site')}>
        <iframe
          key={shopKey}
          ref={shopRef}
          src={SHOP_PATH}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          tabIndex={-1}
          title="Nova Shop"
          className="block border-0"
        />
      </div>
      <div {...sceneProps('telegram')}>
        {telegram && (
          <TelegramChat
            caption={telegram.caption}
            image={telegram.image}
            time={telegram.time}
            show={telegramShow}
          />
        )}
      </div>
      <div {...sceneProps('dashboard')}>
        {dashboard && (
          <iframe
            key={dashboard.key}
            ref={dashboardRef}
            src={dashboard.src}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            tabIndex={-1}
            title="Bugping"
            className="block border-0"
          />
        )}
      </div>
      <div
        className={cn(
          'absolute inset-0 transition-opacity duration-200 motion-reduce:transition-none',
          scene === 'site' ? 'opacity-100' : 'opacity-0',
        )}
      >
        <div ref={cursorRef} className="absolute top-0 left-0 will-change-transform">
          <span
            ref={rippleRef}
            className="absolute -top-[18px] -left-[18px] size-[36px] rounded-full bg-primary/50 opacity-0"
          />
          <CursorArrow />
        </div>
      </div>
    </BrowserFrame>
  );
}

/** One frame per scene in its final state: reduced motion, or after a director failure. */
function StaticFrames({
  runtime,
  locale,
  host,
}: {
  runtime: DemoRuntime | null;
  locale: AppLocale;
  host: string;
}) {
  const [time] = useState(() => clockTime(new Date()));
  const load = runtime !== null;
  const shopRef = useRef<HTMLIFrameElement>(null);
  const dashboardRef = useRef<HTMLIFrameElement>(null);

  // The fixture dashboard gets the static store's real auto-capture (the widget's thumbnail blob),
  // so its screenshot panel is never empty.
  useEffect(() => {
    if (!load) return;
    const origin = window.location.origin;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const deliver = (target: Window, attempt: number) => {
      timer = null;
      const img = shopRef.current?.contentDocument
        ?.querySelector(DEMO_SELECTORS.host)
        ?.shadowRoot?.querySelector<HTMLImageElement>(`${DEMO_SELECTORS.thumbReady} img`);
      if (!img?.src) {
        if (attempt < STATIC_SHOT_ATTEMPTS) {
          timer = setTimeout(() => deliver(target, attempt + 1), STATIC_SHOT_POLL_MS);
        }
        return;
      }
      fetch(img.src)
        .then((response) => response.blob())
        .then((blob) => {
          if (cancelled) return;
          const message: DemoScreenshotMessage = { type: DEMO_MESSAGE.screenshot, blob };
          target.postMessage(message, origin);
        })
        .catch(() => undefined);
    };
    const onMessage = (event: MessageEvent) => {
      const kind = classifyStageMessage(event, origin, {
        shop: shopRef.current?.contentWindow ?? null,
        dashboard: dashboardRef.current?.contentWindow ?? null,
      });
      if (kind !== 'dashboard-ready') return;
      if (timer !== null) clearTimeout(timer);
      deliver(event.source as Window, 0);
    };
    window.addEventListener('message', onMessage);
    return () => {
      cancelled = true;
      window.removeEventListener('message', onMessage);
      if (timer !== null) clearTimeout(timer);
    };
  }, [load]);

  const iframe = (src: string, title: string, ref: RefObject<HTMLIFrameElement | null>) =>
    load && (
      <iframe
        ref={ref}
        src={src}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        tabIndex={-1}
        title={title}
        className="block border-0"
      />
    );
  return (
    <div data-testid="demo-static" className="grid gap-6 md:grid-cols-2">
      <div className="md:col-span-2">
        <BrowserFrame scene="site" host={host}>
          {iframe(SHOP_STATIC_PATH, 'Nova Shop', shopRef)}
        </BrowserFrame>
      </div>
      <BrowserFrame scene="telegram" host={host}>
        {runtime && (
          <TelegramChat caption={runtime.fixtureCaption(locale)} image={null} time={time} show />
        )}
      </BrowserFrame>
      <BrowserFrame scene="dashboard" host={host}>
        {iframe(DASHBOARD_PATH, 'Bugping', dashboardRef)}
      </BrowserFrame>
    </div>
  );
}

/**
 * Nothing loads until the stage is within 200 px of the viewport; then, when the browser is
 * idle, the report code is imported and the stage mounts. It pauses off-screen and in hidden
 * tabs. Reduced motion: static frames plus a "Play demo" button that plays one loop.
 */
export function DemoStage({ appUrl }: { appUrl: string }) {
  const t = useTranslations('landing.demo');
  const locale = useLocale() as AppLocale;
  const host = appHost(appUrl);
  const rootRef = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const [near, setNear] = useState(false);
  const [runtime, setRuntime] = useState<DemoRuntime | null>(null);
  const [inView, setInView] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [failed, setFailed] = useState(false);
  /** Reduced motion only: the requested one-shot run (`run` remounts the stage). */
  const [play, setPlay] = useState<{ run: number; finished: boolean } | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let idle: number | null = null;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        const wake = () => setNear(true);
        if (typeof window.requestIdleCallback === 'function') {
          idle = window.requestIdleCallback(wake, { timeout: 1500 });
        } else {
          timeout = setTimeout(wake, 1);
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(root);
    return () => {
      observer.disconnect();
      if (idle !== null) window.cancelIdleCallback(idle);
      if (timeout !== null) clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    if (!near) return;
    let cancelled = false;
    loadDemoRuntime(appUrl).then(
      (loaded) => {
        if (!cancelled) setRuntime(() => loaded);
      },
      (error: unknown) => {
        if (cancelled) return;
        console.warn('[demo] could not load the demo code; showing the static frames', error);
        setFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [near, appUrl]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (entry) setInView(entry.isIntersecting);
      },
      { threshold: 0 },
    );
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    return root ? installFocusGuard(root, window) : undefined;
  }, []);

  useEffect(() => {
    const update = () => setPageVisible(!document.hidden);
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  const onFallback = useCallback(() => setFailed(true), []);
  const onDone = useCallback(() => setPlay((p) => (p ? { ...p, finished: true } : p)), []);

  const live = !failed && (!reduced || play !== null);
  const showPlay = reduced && !failed && (play === null || play.finished);

  return (
    <section ref={rootRef} id="demo" data-testid="landing-demo" className="scroll-mt-24">
      <p className="sr-only">{t('srDescription')}</p>
      {showPlay && (
        <div className="mb-6 flex justify-center">
          <Button
            size="lg"
            variant="outline"
            data-testid="demo-play"
            onClick={() => setPlay((p) => ({ run: (p?.run ?? 0) + 1, finished: false }))}
          >
            <Play data-icon="inline-start" aria-hidden="true" />
            {t('play')}
          </Button>
        </div>
      )}
      {live ? (
        runtime ? (
          <LiveStage
            key={`${locale}:${play?.run ?? 0}`}
            runtime={runtime}
            locale={locale}
            host={host}
            loop={play === null}
            active={inView && pageVisible}
            onFallback={onFallback}
            onDone={onDone}
          />
        ) : (
          <BrowserFrame scene="site" host={host} />
        )
      ) : (
        <StaticFrames runtime={runtime} locale={locale} host={host} />
      )}
    </section>
  );
}
