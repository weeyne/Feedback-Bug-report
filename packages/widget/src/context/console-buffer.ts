import type { ConsoleError } from '@dymcode/shared';
import { CONSOLE_ERRORS_MAX, CONSOLE_ERROR_MESSAGE_MAX_LENGTH } from '@dymcode/shared/constants';

export interface ConsoleBuffer {
  entries(): ConsoleError[];
  dispose(): void;
}

function stringify(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) {
    try {
      return `${value.name}: ${value.message}`;
    } catch {
      return '[unserializable]';
    }
  }
  try {
    return JSON.stringify(value) ?? '[unserializable]';
  } catch {
    // JSON.stringify failed; try String() as fallback
    try {
      return String(value);
    } catch {
      return '[unserializable]';
    }
  }
}

/** Keeps the last few host-page errors so reports carry context. Never throws. */
export function installConsoleBuffer(win: Window, ownScriptUrl: string): ConsoleBuffer {
  const ring: ConsoleError[] = [];

  const push = (message: string, source?: string, line?: number, stack?: string) => {
    try {
      if (ownScriptUrl && (source?.includes(ownScriptUrl) || stack?.includes(ownScriptUrl))) return;
      const entry: ConsoleError = {
        message: message.slice(0, CONSOLE_ERROR_MESSAGE_MAX_LENGTH),
        at: Date.now(),
      };
      if (source) entry.source = source.slice(0, 2048);
      if (line !== undefined && Number.isInteger(line) && line >= 0) entry.line = line;
      ring.push(entry);
      if (ring.length > CONSOLE_ERRORS_MAX) ring.shift();
    } catch {
      // Recording must never break the host page.
    }
  };

  const onError = (event: ErrorEvent) => {
    const message = event.message || stringify(event.error);
    push(message, event.filename || undefined, event.lineno || undefined, event.error?.stack);
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    push(stringify(event.reason), undefined, undefined, event.reason?.stack);
  };

  const winWithConsole = win as Window & { console: Console };
  const original = winWithConsole.console.error;
  const wrapped = function (this: unknown, ...args: unknown[]) {
    try {
      const error = args.find((arg): arg is Error => arg instanceof Error);
      push(args.map(stringify).join(' '), undefined, undefined, error?.stack);
    } catch {
      // Recording must never break the host page.
    }
    return original.apply(this, args);
  } as typeof console.error;

  win.addEventListener('error', onError);
  win.addEventListener('unhandledrejection', onRejection);
  winWithConsole.console.error = wrapped;

  return {
    entries: () => ring.slice(),
    dispose() {
      win.removeEventListener('error', onError);
      win.removeEventListener('unhandledrejection', onRejection);
      if (winWithConsole.console.error === wrapped) winWithConsole.console.error = original;
      ring.length = 0;
    },
  };
}
