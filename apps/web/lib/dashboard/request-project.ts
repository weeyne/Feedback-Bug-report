import { cache } from 'react';
import { getDeps } from '../deps';
import { getProject } from './projects';

/**
 * Per-request memoised `getProject` for server components: the project layout (access check)
 * and the page under it share one query. Keyed by primitives only, so `deps` is resolved inside.
 */
export const getRequestProject = cache(async (userId: string, projectId: string) =>
  getProject(await getDeps(), userId, projectId),
);
