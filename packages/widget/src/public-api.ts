import { FEEDBACK_TYPES, type FeedbackType } from '@dymcode/shared/constants';
import type { IdentifiedUser } from './context/metadata';
import type { WidgetHandle } from './ui/mount';

export interface DymcodeApi {
  open(type?: FeedbackType): void;
  identify(user: IdentifiedUser): void;
}

export interface ApiState {
  handle: WidgetHandle | null;
  user: IdentifiedUser | undefined;
}

function isIdentifiedUser(value: unknown): value is IdentifiedUser {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return ['email', 'id', 'name'].every(
    (key) => record[key] === undefined || typeof record[key] === 'string',
  );
}

/** `window.Dymcode`. Every method swallows errors: host pages must never see ours. */
export function createPublicApi(state: ApiState, warn: (message: string) => void): DymcodeApi {
  return {
    open(type) {
      try {
        if (!state.handle) return warn('widget is not ready yet');
        const valid = (FEEDBACK_TYPES as readonly unknown[]).includes(type)
          ? (type as FeedbackType)
          : 'bug';
        state.handle.open(valid);
      } catch {
        // Never propagate into the host page.
      }
    },
    identify(user) {
      try {
        if (!isIdentifiedUser(user))
          return warn('identify() expects { email?, id?, name? } strings');
        state.user = { ...user };
        state.handle?.identify(state.user);
      } catch {
        // Never propagate into the host page.
      }
    },
  };
}
