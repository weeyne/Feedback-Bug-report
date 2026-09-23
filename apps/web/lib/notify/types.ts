import type { FeedbackMetadata, FeedbackType } from '@bugping/shared';

export interface Attachment {
  data: Uint8Array;
  contentType: string;
  filename: string;
}

export interface FeedbackMessage {
  kind: 'feedback';
  projectName: string;
  type: FeedbackType;
  message: string;
  email: string | null;
  metadata: FeedbackMetadata;
  dashboardUrl: string;
  screenshot: Attachment | null;
}

export interface TextNotice {
  kind: 'text';
  text: string;
}

export type Notification = FeedbackMessage | TextNotice;

export type DeliveryResult =
  | { ok: true }
  | { ok: false; retryable: boolean; disable: boolean; error: string; retryAfterSec?: number };

export interface Notifier {
  send(notification: Notification): Promise<DeliveryResult>;
}
