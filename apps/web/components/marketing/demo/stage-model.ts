import type { DemoScene } from './director';
import { DEMO_MESSAGE, DEMO_SHOP_URL, isDemoMessage } from './protocol';

/**
 * Pure pieces of the landing demo stage (demo-stage.tsx): canvas geometry, the browser frame's
 * scene label and URL, and which demo iframe a `message` event comes from.
 */

/** The stage's logical canvas: every scene is laid out at this size and scaled as a whole. */
export const CANVAS_WIDTH = 1280;
export const CANVAS_HEIGHT = 720;

/** `transform: scale(k)` that fits the 1280×720 canvas into a container `width` CSS px wide. */
export function canvasScale(width: number): number {
  return Number.isFinite(width) && width > 0 ? width / CANVAS_WIDTH : 0;
}

/** The i18n key (under `landing.demo`) of the chip above the frame, per scene. */
export const SCENE_LABEL_KEY = {
  site: 'sceneSite',
  telegram: 'sceneTelegram',
  dashboard: 'sceneDashboard',
} as const satisfies Record<DemoScene, string>;

/** The host part of the app URL (`https://bugping.app/` → `bugping.app`); the raw value if unparsable. */
export function appHost(appUrl: string): string {
  try {
    return new URL(appUrl).host;
  } catch {
    return appUrl;
  }
}

/** What the frame's URL bar shows during `scene`. */
export function sceneUrl(scene: DemoScene, host: string): string {
  switch (scene) {
    case 'site':
      // The same fictional address the report carries (`withDemoShopUrl`), without the scheme.
      return DEMO_SHOP_URL.replace(/^https?:\/\//, '');
    case 'telegram':
      return 'Telegram';
    case 'dashboard':
      return host;
  }
}

/** "HH:MM" local clock time, as the Telegram replica stamps a message. */
export function clockTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/*
 * The demo iframe URLs carry no `?lang=` / `?theme=`: they are same-origin with the landing, so
 * they already render in the landing's locale (next-intl reads the same locale cookie on the
 * server) and theme (next-themes reads the same localStorage key, and its `storage` event
 * listener follows a theme switch on the landing live).
 */
export const SHOP_PATH = '/demo/shop';
export const SHOP_STATIC_PATH = '/demo/shop?static=1';
export const DASHBOARD_PATH = '/demo/dashboard';

/** The scene-3 iframe for an encoded report (`encodeDemoReport`). */
export function dashboardSrc(encodedReport: string): string {
  return `${DASHBOARD_PATH}?r=${encodedReport}`;
}

export type StageMessageKind = 'shop-ready' | 'submitted' | 'dashboard-ready';

/**
 * Classifies a `message` event received by the stage. Only messages from this page's origin and
 * from the current shop / dashboard iframe window count (a message from a replaced iframe, or
 * another frame, is ignored). A `submitted` message must carry a payload object and a Blob or
 * null screenshot.
 */
export function classifyStageMessage(
  event: Pick<MessageEvent, 'origin' | 'data' | 'source'>,
  origin: string,
  frames: { shop: unknown; dashboard: unknown },
): StageMessageKind | null {
  const source: unknown = event.source;
  if (source == null) return null;
  if (source === frames.shop) {
    if (isDemoMessage(event, origin, DEMO_MESSAGE.ready)) return 'shop-ready';
    if (isDemoMessage(event, origin, DEMO_MESSAGE.submitted)) {
      const { payload, screenshot } = event.data as { payload?: unknown; screenshot?: unknown };
      const validShot =
        screenshot === null || (typeof Blob !== 'undefined' && screenshot instanceof Blob);
      return typeof payload === 'object' && payload !== null && validShot ? 'submitted' : null;
    }
    return null;
  }
  if (source === frames.dashboard && isDemoMessage(event, origin, DEMO_MESSAGE.dashboardReady)) {
    return 'dashboard-ready';
  }
  return null;
}
