import type { FeedbackType, WidgetLocale } from '@dymcode/shared/constants';

export type Locale = Exclude<WidgetLocale, 'auto'>;

export interface Messages {
  title: string;
  types: Record<FeedbackType, string>;
  placeholders: Record<FeedbackType, string>;
  emailLabel: string;
  emailPlaceholder: string;
  screenshot: string;
  screenshotUnavailable: string;
  send: string;
  sending: string;
  thanks: string;
  errorRequired: string;
  errorEmail: string;
  errorRateLimited: string;
  errorInvalid: string;
  errorNetwork: string;
  retry: string;
  close: string;
  /** Prefix before the product name in the badge. */
  poweredBy: string;
}

export const MESSAGES: Record<Locale, Messages> = {
  en: {
    title: 'Send feedback',
    types: { bug: 'Bug', idea: 'Idea', general: 'Other' },
    placeholders: {
      bug: 'What happened?',
      idea: "What's your idea?",
      general: "What's on your mind?",
    },
    emailLabel: 'Email (optional)',
    emailPlaceholder: 'you@example.com',
    screenshot: 'Attach screenshot',
    screenshotUnavailable: 'Screenshot unavailable',
    send: 'Send',
    sending: 'Sending…',
    thanks: 'Thanks! Your feedback was sent.',
    errorRequired: 'Write a message first.',
    errorEmail: 'Check the email address.',
    errorRateLimited: 'Too many submissions. Try again later.',
    errorInvalid: "Couldn't send. Try again later.",
    errorNetwork: "Couldn't send. Check your connection.",
    retry: 'Retry',
    close: 'Close',
    poweredBy: 'Powered by',
  },
  ru: {
    title: 'Отправить отзыв',
    types: { bug: 'Баг', idea: 'Идея', general: 'Другое' },
    placeholders: {
      bug: 'Что случилось?',
      idea: 'Какая у вас идея?',
      general: 'Что вы хотите сказать?',
    },
    emailLabel: 'Email (необязательно)',
    emailPlaceholder: 'you@example.com',
    screenshot: 'Приложить скриншот',
    screenshotUnavailable: 'Скриншот недоступен',
    send: 'Отправить',
    sending: 'Отправка…',
    thanks: 'Спасибо! Отзыв отправлен.',
    errorRequired: 'Сначала напишите сообщение.',
    errorEmail: 'Проверьте адрес email.',
    errorRateLimited: 'Слишком много отправок. Попробуйте позже.',
    errorInvalid: 'Не удалось отправить. Попробуйте позже.',
    errorNetwork: 'Не удалось отправить. Проверьте подключение.',
    retry: 'Повторить',
    close: 'Закрыть',
    poweredBy: 'Работает на',
  },
  uk: {
    title: 'Надіслати відгук',
    types: { bug: 'Баг', idea: 'Ідея', general: 'Інше' },
    placeholders: {
      bug: 'Що сталося?',
      idea: 'Яка у вас ідея?',
      general: 'Що ви хочете сказати?',
    },
    emailLabel: 'Email (необовʼязково)',
    emailPlaceholder: 'you@example.com',
    screenshot: 'Додати скриншот',
    screenshotUnavailable: 'Скриншот недоступний',
    send: 'Надіслати',
    sending: 'Надсилання…',
    thanks: 'Дякуємо! Відгук надіслано.',
    errorRequired: 'Спершу напишіть повідомлення.',
    errorEmail: 'Перевірте адресу email.',
    errorRateLimited: 'Забагато надсилань. Спробуйте пізніше.',
    errorInvalid: 'Не вдалося надіслати. Спробуйте пізніше.',
    errorNetwork: 'Не вдалося надіслати. Перевірте зʼєднання.',
    retry: 'Повторити',
    close: 'Закрити',
    poweredBy: 'Працює на',
  },
  es: {
    title: 'Enviar comentarios',
    types: { bug: 'Error', idea: 'Idea', general: 'Otro' },
    placeholders: {
      bug: '¿Qué ha pasado?',
      idea: '¿Cuál es tu idea?',
      general: '¿Qué quieres contarnos?',
    },
    emailLabel: 'Email (opcional)',
    emailPlaceholder: 'tu@ejemplo.com',
    screenshot: 'Adjuntar captura',
    screenshotUnavailable: 'Captura no disponible',
    send: 'Enviar',
    sending: 'Enviando…',
    thanks: '¡Gracias! Comentario enviado.',
    errorRequired: 'Escribe un mensaje primero.',
    errorEmail: 'Revisa el email.',
    errorRateLimited: 'Demasiados envíos. Inténtalo más tarde.',
    errorInvalid: 'No se pudo enviar. Inténtalo más tarde.',
    errorNetwork: 'No se pudo enviar. Revisa tu conexión.',
    retry: 'Reintentar',
    close: 'Cerrar',
    poweredBy: 'Con tecnología de',
  },
};

const SUPPORTED = Object.keys(MESSAGES) as Locale[];

/** Owner's choice wins; `auto` picks the first supported browser language, else English. */
export function resolveLocale(configured: WidgetLocale, languages: readonly string[]): Locale {
  if (configured !== 'auto') return configured;
  for (const tag of languages) {
    const primary = tag.toLowerCase().split('-')[0] as Locale;
    if (SUPPORTED.includes(primary)) return primary;
  }
  return 'en';
}
