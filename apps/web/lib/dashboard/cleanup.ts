import type { Storage } from '../storage';

const CHUNK = 100;

/** Best-effort removal of screenshot objects; failures are logged, never thrown (the retention cron is the backstop). */
export async function removeScreenshots(storage: Storage, paths: string[]): Promise<void> {
  for (let i = 0; i < paths.length; i += CHUNK) {
    try {
      await storage.remove(paths.slice(i, i + CHUNK));
    } catch (error) {
      console.error('[dashboard] screenshot cleanup failed', error);
    }
  }
}
