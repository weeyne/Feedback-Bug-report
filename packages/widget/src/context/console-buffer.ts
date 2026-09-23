import type { ConsoleError } from '@bugping/shared';
import { CONSOLE_ERRORS_MAX, CONSOLE_ERROR_MESSAGE_MAX_LENGTH } from '@bugping/shared/constants';

export interface ConsoleBuffer {
  entries(): ConsoleError[];
  dispose(): void;
}

const MAX_DEPTH = 3;
const MAX_ENTRIES = 20;
const MAX_CHARS = CONSOLE_ERROR_MESSAGE_MAX_LENGTH;

function safeString(value: unknown): string {
  try {
    return String(value);
  } catch {
    return '[unserializable]';
  }
}

/**
 * JSON-like rendering with hard bounds (depth, entries per level, output length) so a huge or
 * hostile value costs almost nothing. Reads own data properties via descriptors, so host getters
 * are never invoked; cycles print as [Circular].
 */
function serialize(value: unknown): string {
  let out = '';
  const seen = new Set<object>();
  const emit = (piece: string) => {
    out += piece.slice(0, Math.max(0, MAX_CHARS - out.length));
  };

  const walk = (v: unknown, depth: number): void => {
    if (out.length >= MAX_CHARS) return;
    if (v === null) return emit('null');
    if (typeof v === 'string') return emit(JSON.stringify(v.slice(0, MAX_CHARS)));
    if (typeof v !== 'object') return emit(safeString(v));
    if (seen.has(v)) return emit('[Circular]');
    const isArray = Array.isArray(v);
    if (depth >= MAX_DEPTH) return emit(isArray ? '[Array]' : '[Object]');
    if (v instanceof Date)
      return emit(safeString(JSON.stringify(v.getTime() ? v.toISOString() : null)));
    seen.add(v);
    try {
      const keys = Reflect.ownKeys(v)
        .filter((key): key is string => typeof key === 'string' && !(isArray && key === 'length'))
        .slice(0, MAX_ENTRIES + 1);
      emit(isArray ? '[' : '{');
      let count = 0;
      for (const key of keys) {
        if (out.length >= MAX_CHARS) return;
        if (count === MAX_ENTRIES) {
          emit(',…');
          break;
        }
        const descriptor = Reflect.getOwnPropertyDescriptor(v, key);
        if (!descriptor?.enumerable) continue;
        if (count++) emit(',');
        if (!isArray) emit(`${JSON.stringify(key)}:`);
        if ('value' in descriptor) walk(descriptor.value, depth + 1);
        else emit('[Getter]');
      }
      emit(isArray ? ']' : '}');
    } catch {
      emit('[unserializable]');
    } finally {
      seen.delete(v);
    }
  };

  walk(value, 0);
  return out;
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
    return serialize(value);
  } catch {
    return '[unserializable]';
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
