import { z } from 'zod';
import { CONSOLE_ERRORS_MAX, CONSOLE_ERROR_MESSAGE_MAX_LENGTH } from '../constants';

const dimension = z.number().int().nonnegative().max(100_000);

export const ConsoleErrorSchema = z.object({
  message: z.string().max(CONSOLE_ERROR_MESSAGE_MAX_LENGTH),
  source: z.string().max(2048).optional(),
  line: z.number().int().nonnegative().optional(),
  /** Epoch milliseconds. */
  at: z.number().int().nonnegative(),
});
export type ConsoleError = z.infer<typeof ConsoleErrorSchema>;

/** Context collected by the widget. Browser and OS are parsed server-side from `userAgent`. */
export const ClientMetadataSchema = z.object({
  url: z.url({ protocol: /^https?$/ }).max(2048),
  referrer: z.string().max(2048),
  userAgent: z.string().max(1024),
  language: z.string().max(35),
  timezone: z.string().max(64),
  viewport: z.object({ w: dimension, h: dimension }),
  screen: z.object({ w: dimension, h: dimension, dpr: z.number().positive().max(10) }),
  consoleErrors: z.array(ConsoleErrorSchema).max(CONSOLE_ERRORS_MAX),
  /** Set by `Bugping.identify()` on the host page. */
  user: z
    .object({ id: z.string().max(128).optional(), name: z.string().max(128).optional() })
    .optional(),
});
export type ClientMetadata = z.infer<typeof ClientMetadataSchema>;

/** Shape persisted in `feedback.metadata`. */
export type FeedbackMetadata = ClientMetadata & { browser: string; os: string };
