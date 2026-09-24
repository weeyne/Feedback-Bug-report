import type { SubmitPayload } from '@bugping/shared';
import type { AppLocale } from '@/i18n/locale';

type Report = Pick<SubmitPayload, 'type' | 'message' | 'email' | 'metadata'>;

/** What the demo stage needs beyond rendering: loaded lazily, once the stage is near the viewport. */
export interface DemoRuntime {
  /** The Telegram caption the real bot sends for a scene-1 report. */
  caption(payload: Report): string;
  /** The caption for the fixture report (static frames). */
  fixtureCaption(locale: AppLocale): string;
  /** The `?r=` value of /demo/dashboard for a scene-1 report. */
  encode(payload: Report): string;
}

/**
 * Loads the report formatting code with dynamic `import()`, so `ua-parser-js` (`describeAgent`),
 * zod and the notification formatter stay out of the landing's first-load JS.
 */
export async function loadDemoRuntime(appUrl: string): Promise<DemoRuntime> {
  const [{ describeAgent }, report, dashboard] = await Promise.all([
    import('@/lib/widget/user-agent'),
    import('./demo-report'),
    import('./dashboard-report'),
  ]);
  const dashboardUrl = report.demoDashboardUrl(appUrl);
  const caption = (payload: Report) =>
    report.demoCaption(report.buildDemoMessage({ payload, dashboardUrl, describe: describeAgent }));
  return {
    caption,
    fixtureCaption: (locale) => caption(report.fixtureReport(locale, appUrl)),
    encode: dashboard.encodeDemoReport,
  };
}
