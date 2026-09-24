import type { AppLocale } from '@/i18n/locale';

/**
 * `postMessage` protocol between the landing demo stage and its same-origin demo iframes
 * (/demo/shop, /demo/dashboard). Every message is posted with `targetOrigin = location.origin`
 * and receivers check `event.origin` the same way (see `isDemoMessage`).
 */
export const DEMO_MESSAGE = {
  /** /demo/shop → stage: the real widget is mounted. */
  ready: 'bugping-demo:ready',
  /** /demo/shop → stage: the widget "sent" a report (payload + screenshot blob). */
  submitted: 'bugping-demo:submitted',
  /** stage → /demo/dashboard: the scene-1 screenshot blob. */
  screenshot: 'bugping-demo:screenshot',
  /** /demo/dashboard → stage: the dashboard page is ready for the screenshot. */
  dashboardReady: 'bugping-demo:dashboard-ready',
  /**
   * stage → /demo/dashboard: scene 3 is now visible. The iframe loads during scene 2, so its entry
   * animations have already played unseen; the bridge replays them.
   */
  dashboardShow: 'bugping-demo:dashboard-show',
} as const;

export type DemoMessageType = (typeof DEMO_MESSAGE)[keyof typeof DEMO_MESSAGE];

/** stage → /demo/dashboard: the (annotated) scene-1 screenshot for the detail panel. */
export interface DemoScreenshotMessage {
  type: typeof DEMO_MESSAGE.screenshot;
  blob: Blob;
}

/** /demo/dashboard → stage: posted once on mount; the stage may send the screenshot now. */
export interface DemoDashboardReadyMessage {
  type: typeof DEMO_MESSAGE.dashboardReady;
}

/** stage → /demo/dashboard: replay the dashboard's entry animations (scene 3 is shown). */
export interface DemoDashboardShowMessage {
  type: typeof DEMO_MESSAGE.dashboardShow;
}

/**
 * The fictional store's page, as the report shows it: the demo store really lives at /demo/shop
 * on the app's own origin, but the story (URL bar, Telegram caption, dashboard) is Nova Shop's
 * checkout at a third-party address.
 */
export const DEMO_SHOP_URL = 'https://shop.example.com/checkout';

/** The message the demo visitor types into the widget, per landing locale. */
export const DEMO_TEXT: Record<AppLocale, string> = {
  en: 'The pay button does nothing',
  ru: 'Кнопка оплаты не работает',
};

/** Any valid-looking public key (`pk_` + 16 alphanumerics); the demo never sends it anywhere. */
export const DEMO_PROJECT_KEY = 'pk_NovaShopDemo0001';
export const DEMO_PROJECT_NAME = 'Nova Shop';
export const DEMO_PRIMARY_COLOR = '#E0321F';
/** Stable id of the store's "Pay" button: the director draws the rectangle around it. */
export const DEMO_PAY_ID = 'demo-pay';
/** How long the fake `submit` takes, so the widget shows its real "Sending…" state. */
export const DEMO_SUBMIT_DELAY_MS = 600;
/** The "broken checkout" error the store logs, captured by the real console buffer. */
export const DEMO_CONSOLE_ERROR = 'PaymentError: checkout session expired (code 419)';

/** True when `event` is a demo message of `type` from this page's own origin. */
export function isDemoMessage(
  event: Pick<MessageEvent, 'origin' | 'data'>,
  origin: string,
  type: DemoMessageType,
): boolean {
  const data: unknown = event.data;
  return (
    event.origin === origin &&
    typeof data === 'object' &&
    data !== null &&
    (data as { type?: unknown }).type === type
  );
}
