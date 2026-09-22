import type { ClientMetadata, ConsoleError } from '@dymcode/shared';

/** What the host page passed to `Dymcode.identify()`. */
export interface IdentifiedUser {
  email?: string;
  id?: string;
  name?: string;
}

const clampDimension = (value: number) => Math.min(Math.max(Math.round(value) || 0, 0), 100_000);

function timezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
  } catch {
    return '';
  }
}

/** Snapshot of page context taken at submit time. The email travels in the payload, not here. */
export function collectMetadata(
  win: Window,
  consoleErrors: ConsoleError[],
  user?: IdentifiedUser,
): ClientMetadata {
  const dpr = win.devicePixelRatio > 0 ? Math.min(win.devicePixelRatio, 10) : 1;
  const meta: ClientMetadata = {
    url: win.location.href.slice(0, 2048),
    referrer: win.document.referrer.slice(0, 2048),
    userAgent: win.navigator.userAgent.slice(0, 1024),
    language: (win.navigator.language || '').slice(0, 35),
    timezone: timezone().slice(0, 64),
    viewport: { w: clampDimension(win.innerWidth), h: clampDimension(win.innerHeight) },
    screen: { w: clampDimension(win.screen.width), h: clampDimension(win.screen.height), dpr },
    consoleErrors,
  };
  const id = user?.id?.slice(0, 128);
  const name = user?.name?.slice(0, 128);
  if (id || name) meta.user = { ...(id ? { id } : {}), ...(name ? { name } : {}) };
  return meta;
}
