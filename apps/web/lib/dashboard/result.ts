import type { AppDeps } from '../deps';

export type ActionResult<T extends object = object> =
  ({ ok: true } & T) | { ok: false; error: string };

export type DashDeps = Pick<AppDeps, 'db' | 'storage' | 'env' | 'fetch'>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string) => UUID.test(value);
