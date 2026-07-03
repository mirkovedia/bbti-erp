import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

export const SESSION_COOKIE = 'bbti_session';

export interface SessionPayload {
  sub: string;    // id del usuario (uuid)
  rol: string;
  nombre: string;
}

const getSecret = (): Uint8Array => {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) {
    throw new Error('JWT_SECRET debe existir y tener al menos 32 caracteres');
  }
  return new TextEncoder().encode(s);
};

export const createSessionToken = async (p: SessionPayload): Promise<string> =>
  new SignJWT({ rol: p.rol, nombre: p.nombre })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(p.sub)
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getSecret());

export const verifySessionToken = async (token: string): Promise<SessionPayload | null> => {
  try {
    // Algoritmo fijado: evita confusión de algoritmos si esto migra a claves asimétricas
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: ['HS256'] });
    if (!payload.sub) return null;
    return { sub: payload.sub, rol: String(payload.rol ?? ''), nombre: String(payload.nombre ?? '') };
  } catch {
    return null;
  }
};

/** Sesión del request actual (API routes / Server Components). null si no hay o es inválida. */
export const getSession = async (): Promise<SessionPayload | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
};
