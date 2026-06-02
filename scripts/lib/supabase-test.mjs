// scripts/lib/supabase-test.mjs
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync(new URL('../../.env.local', import.meta.url), 'utf8');
const get = (k) => {
  const m = env.match(new RegExp('^' + k + '=(.*)$', 'm'));
  return m ? m[1].trim().replace(/\r/g, '') : '';
};

export const SUPA_URL = get('NEXT_PUBLIC_SUPABASE_URL');
const ANON = get('NEXT_PUBLIC_SUPABASE_ANON_KEY');
const SERVICE = get('SUPABASE_SERVICE_ROLE_KEY');
const REF = SUPA_URL.match(/https:\/\/([^.]+)\./)[1];

export const anonClient = () => createClient(SUPA_URL, ANON, { auth: { persistSession: false } });
export const serviceClient = () => createClient(SUPA_URL, SERVICE, { auth: { persistSession: false } });

// Devuelve el header Cookie que el navegador enviaría para una sesión @supabase/ssr
export async function getAuthCookie(email, password) {
  const sb = anonClient();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error('login: ' + error.message);
  const s = data.session;
  const val = 'base64-' + Buffer.from(JSON.stringify({
    access_token: s.access_token, token_type: 'bearer', expires_in: s.expires_in,
    expires_at: s.expires_at, refresh_token: s.refresh_token, user: s.user,
  })).toString('base64');
  const name = 'sb-' + REF + '-auth-token';
  if (val.length > 3180) {
    const chunks = [];
    for (let i = 0, n = 0; i < val.length; i += 3180, n++) chunks.push(name + '.' + n + '=' + val.slice(i, i + 3180));
    return chunks.join('; ');
  }
  return name + '=' + val;
}
