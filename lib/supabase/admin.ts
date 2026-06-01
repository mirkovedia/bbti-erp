import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * Cliente con service role key. SOLO usar en el servidor (API routes / scripts).
 * Tiene permisos de admin: bypasea RLS y permite operaciones sobre auth.users.
 */
export const createAdminClient = () =>
  createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    }
  );
