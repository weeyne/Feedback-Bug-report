/** Cookie holding the last opened project, so the sidebar keeps its nav on the account pages. */
export const REMEMBERED_PROJECT_COOKIE = 'bp_project';

const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/** Pages outside any project that still show the last project's nav. */
const ACCOUNT_AREA = /^\/app\/(?:account|billing)(?:\/|$)/;

export function rememberedProjectCookie(projectId: string, secure = false): string {
  return `${REMEMBERED_PROJECT_COOKIE}=${encodeURIComponent(projectId)}; path=/; max-age=${MAX_AGE_SECONDS}; samesite=lax${secure ? '; secure' : ''}`;
}

/**
 * The last project opened in this tab, shared by every nav mount (the sidebar and the mobile
 * sheet, which remounts on each open). Client-only: it is written from effects and read through
 * useSyncExternalStore, whose server snapshot is the cookie value.
 */
let lastOpenedProjectId: string | null = null;
const listeners = new Set<() => void>();

export const lastOpenedProject = {
  get: (): string | null => lastOpenedProjectId,
  set(projectId: string): void {
    if (projectId === lastOpenedProjectId) return;
    lastOpenedProjectId = projectId;
    for (const listener of listeners) listener();
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  reset(): void {
    lastOpenedProjectId = null;
  },
};

/** The project id of an /app/p/<id>/... route, if any. */
export function routeProjectId(pathname: string): string | null {
  return /^\/app\/p\/([^/]+)/.exec(pathname)?.[1] ?? null;
}

/**
 * The project whose nav the sidebar shows: the route's own project, or on the account and billing
 * pages the last opened one, as long as it still exists.
 */
export function navProjectId({
  pathname,
  remembered,
  projectIds,
}: {
  pathname: string;
  remembered: string | null | undefined;
  projectIds: readonly string[];
}): string | null {
  const own = routeProjectId(pathname);
  if (own) return own;
  if (remembered && ACCOUNT_AREA.test(pathname) && projectIds.includes(remembered))
    return remembered;
  return null;
}
