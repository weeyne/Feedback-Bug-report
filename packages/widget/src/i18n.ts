import type { FeedbackType, WidgetLocale } from '@bugping/shared/constants';
import type { AnnotateMessages } from './annotate/types';

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
  homeTitle: string;
  homeSubtitle: string;
  cards: Record<FeedbackType, string>;
  cardHints: Record<FeedbackType, string>;
  back: string;
  shot: {
    label: string;
    capture: string;
    file: string;
    pasteHint: string;
    annotate: string;
    replace: string;
    remove: string;
    capturing: string;
    captureFailed: string;
    editorUnavailable: string;
    notImage: string;
    tooLarge: string;
    decode: string;
  };
  annotate: AnnotateMessages;
}

export const MESSAGES: Record<Locale, Messages> = {
  en: {
    title: 'Send feedback',
    types: { bug: 'Bug', idea: 'Idea', general: 'Other' },
    placeholders: {
      bug: 'What happened? What did you expect?',
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
    homeTitle: 'Hi 👋',
    homeSubtitle: 'Found a problem or have an idea? Tell us.',
    cards: {
      bug: 'Report a bug',
      idea: 'Suggest an idea',
      general: 'Ask a question',
    },
    cardHints: {
      bug: 'Something is broken',
      idea: 'How to make it better',
      general: "We'll reply by email",
    },
    back: 'Back',
    shot: {
      label: 'Screenshot',
      capture: 'Capture this page',
      file: 'Your file',
      pasteHint: 'or paste (Ctrl+V) / drop an image here',
      annotate: 'Annotate',
      replace: 'Replace',
      remove: 'Remove',
      capturing: 'Capturing the page…',
      captureFailed: "Couldn't capture the page",
      editorUnavailable: 'Editor unavailable',
      notImage: "That file isn't an image",
      tooLarge: 'The image is too large',
      decode: "Couldn't open the image",
    },
    annotate: {
      rect: 'Rectangle',
      pen: 'Pen',
      hide: 'Hide',
      undo: 'Undo',
      done: 'Done',
      cancel: 'Cancel',
      canvas: 'Screenshot drawing area',
    },
  },
  ru: {
    title: 'Отправить отзыв',
    types: { bug: 'Баг', idea: 'Идея', general: 'Другое' },
    placeholders: {
      bug: 'Что случилось? Что вы ожидали увидеть?',
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
    homeTitle: 'Привет 👋',
    homeSubtitle: 'Нашли проблему или есть идея? Расскажите нам.',
    cards: {
      bug: 'Сообщить о баге',
      idea: 'Предложить идею',
      general: 'Задать вопрос',
    },
    cardHints: {
      bug: 'Что-то сломалось',
      idea: 'Как сделать лучше',
      general: 'Ответим на email',
    },
    back: 'Назад',
    shot: {
      label: 'Скриншот',
      capture: 'Снять страницу',
      file: 'Свой файл',
      pasteHint: 'или вставьте (Ctrl+V) / перетащите картинку сюда',
      annotate: 'Пометить',
      replace: 'Заменить',
      remove: 'Убрать',
      capturing: 'Снимаем страницу…',
      captureFailed: 'Не удалось снять страницу',
      editorUnavailable: 'Редактор недоступен',
      notImage: 'Этот файл не картинка',
      tooLarge: 'Картинка слишком большая',
      decode: 'Не удалось открыть картинку',
    },
    annotate: {
      rect: 'Рамка',
      pen: 'Карандаш',
      hide: 'Скрыть',
      undo: 'Отменить',
      done: 'Готово',
      cancel: 'Отмена',
      canvas: 'Область рисования на скриншоте',
    },
  },
  uk: {
    title: 'Надіслати відгук',
    types: { bug: 'Баг', idea: 'Ідея', general: 'Інше' },
    placeholders: {
      bug: 'Що сталося? Що ви очікували побачити?',
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
    homeTitle: 'Привіт 👋',
    homeSubtitle: 'Знайшли проблему чи маєте ідею? Розкажіть нам.',
    cards: {
      bug: 'Повідомити про баг',
      idea: 'Запропонувати ідею',
      general: 'Поставити запитання',
    },
    cardHints: {
      bug: 'Щось зламалося',
      idea: 'Як зробити краще',
      general: 'Відповімо на email',
    },
    back: 'Назад',
    shot: {
      label: 'Скриншот',
      capture: 'Зняти сторінку',
      file: 'Свій файл',
      pasteHint: 'або вставте (Ctrl+V) / перетягніть зображення сюди',
      annotate: 'Позначити',
      replace: 'Замінити',
      remove: 'Прибрати',
      capturing: 'Знімаємо сторінку…',
      captureFailed: 'Не вдалося зняти сторінку',
      editorUnavailable: 'Редактор недоступний',
      notImage: 'Цей файл не зображення',
      tooLarge: 'Зображення завелике',
      decode: 'Не вдалося відкрити зображення',
    },
    annotate: {
      rect: 'Рамка',
      pen: 'Олівець',
      hide: 'Приховати',
      undo: 'Скасувати',
      done: 'Готово',
      cancel: 'Скасувати',
      canvas: 'Область малювання на скриншоті',
    },
  },
  es: {
    title: 'Enviar comentarios',
    types: { bug: 'Error', idea: 'Idea', general: 'Otro' },
    placeholders: {
      bug: '¿Qué pasó? ¿Qué esperabas?',
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
    homeTitle: 'Hola 👋',
    homeSubtitle: '¿Encontraste un problema o tienes una idea? Cuéntanos.',
    cards: {
      bug: 'Informar de un error',
      idea: 'Sugerir una idea',
      general: 'Hacer una pregunta',
    },
    cardHints: {
      bug: 'Algo no funciona',
      idea: 'Cómo mejorarlo',
      general: 'Te responderemos por email',
    },
    back: 'Atrás',
    shot: {
      label: 'Captura',
      capture: 'Capturar la página',
      file: 'Tu archivo',
      pasteHint: 'o pega (Ctrl+V) / suelta una imagen aquí',
      annotate: 'Anotar',
      replace: 'Reemplazar',
      remove: 'Quitar',
      capturing: 'Capturando la página…',
      captureFailed: 'No se pudo capturar la página',
      editorUnavailable: 'Editor no disponible',
      notImage: 'Ese archivo no es una imagen',
      tooLarge: 'La imagen es demasiado grande',
      decode: 'No se pudo abrir la imagen',
    },
    annotate: {
      rect: 'Rectángulo',
      pen: 'Lápiz',
      hide: 'Ocultar',
      undo: 'Deshacer',
      done: 'Listo',
      cancel: 'Cancelar',
      canvas: 'Área de dibujo de la captura',
    },
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
