import type { FeedbackMessage } from '@/lib/notify/types';

export function sampleMessage(overrides: Partial<FeedbackMessage> = {}): FeedbackMessage {
  return {
    kind: 'feedback',
    projectName: 'Acme <Shop>',
    type: 'bug',
    message: 'Checkout <b>fails</b> & nothing happens',
    email: 'ann@example.com',
    metadata: {
      url: 'https://host.example/checkout?plan=pro',
      referrer: '',
      userAgent: 'UA',
      language: 'en-US',
      timezone: 'UTC',
      viewport: { w: 1280, h: 720 },
      screen: { w: 1920, h: 1080, dpr: 2 },
      consoleErrors: [{ message: 'TypeError: x is undefined', at: 1 }],
      browser: 'Chrome 129',
      os: 'Windows 10',
    },
    dashboardUrl: 'https://bugping.app/projects/p1/feedback?f=f1',
    screenshot: null,
    ...overrides,
  };
}
