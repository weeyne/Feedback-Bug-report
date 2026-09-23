import { createClient } from '@supabase/supabase-js';
import type { AppDeps } from '../deps';

export interface AuthAdmin {
  /** Deletes the auth user; the DB cascades to profiles, projects, feedback and integrations. Throws on failure. */
  deleteUser(userId: string): Promise<void>;
}

export function getAuthAdmin(deps: Pick<AppDeps, 'db' | 'env'>): AuthAdmin {
  if (deps.env.BUGPING_TEST_MODE === '1') {
    return {
      deleteUser: async (userId) => {
        await deps.db.query('delete from auth.users where id = $1', [userId]);
      },
    };
  }
  const client = createClient(
    deps.env.NEXT_PUBLIC_SUPABASE_URL,
    deps.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  return {
    deleteUser: async (userId) => {
      const { error } = await client.auth.admin.deleteUser(userId);
      if (error) throw new Error(`auth admin deleteUser failed: ${error.message}`);
    },
  };
}
