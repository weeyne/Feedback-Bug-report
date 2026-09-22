// Must stay free of runtime dependencies: the widget bundle imports this file directly.

export const FEEDBACK_TYPES = ['bug', 'idea', 'general'] as const;
export type FeedbackType = (typeof FEEDBACK_TYPES)[number];

export const WIDGET_POSITIONS = ['bottom-right', 'bottom-left'] as const;
export type WidgetPosition = (typeof WIDGET_POSITIONS)[number];

export const MESSAGE_MAX_LENGTH = 5000;
export const EMAIL_MAX_LENGTH = 254;
export const TRIGGER_TEXT_MAX_LENGTH = 40;
export const CUSTOM_CSS_MAX_BYTES = 10_240;

export const SCREENSHOT_MAX_BYTES = 2 * 1024 * 1024;
export const SCREENSHOT_MIME_TYPES = ['image/webp', 'image/png', 'image/jpeg'] as const;

export const CONSOLE_ERRORS_MAX = 10;
export const CONSOLE_ERROR_MESSAGE_MAX_LENGTH = 500;

export const PUBLIC_KEY_PATTERN = /^pk_[0-9A-Za-z]{16}$/;
export const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export const WIDGET_LOCALES = ['auto', 'en', 'ru', 'uk', 'es'] as const;
export type WidgetLocale = (typeof WIDGET_LOCALES)[number];
