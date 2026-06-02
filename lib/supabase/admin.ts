import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * Cliente con service role key. SOLO usar en el servidor (API routes / scripts).
 * Tiene permisos de admin: bypasea RLS y permite operaciones sobre auth.users.
 */
export const createAdminClient = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      'Faltan variables de entorno: NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY'
    );
  }
  return createSupabaseClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
};
