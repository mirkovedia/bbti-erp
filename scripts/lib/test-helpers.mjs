// Helpers de test post-migración: login HTTP real + Prisma para setup/teardown.
// Reemplaza a supabase-test.mjs (anonClient/serviceClient/getAuthCookie).
import prismaPkg from '@prisma/client';
const { PrismaClient } = prismaPkg;

export const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

export const db = new PrismaClient();

/** Cookie de sesión real: hace login contra la app y devuelve "bbti_session=...". */
export async function getAuthCookie(email, password) {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`login ${email}: HTTP ${res.status}`);
  const setCookie = res.headers.get('set-cookie') || '';
  const m = setCookie.match(/bbti_session=[^;]+/);
  if (!m) throw new Error('login sin Set-Cookie de sesión');
  return m[0];
}
