/**
 * Usuario de la sesión actual, verificado contra la BASE DE DATOS.
 * (Archivo aparte de session.ts porque este importa Prisma y session.ts
 * debe seguir siendo edge-safe para el proxy.)
 *
 * A diferencia de getSession() (que solo valida la firma del JWT), esto
 * garantiza en cada request que:
 *  - el usuario sigue EXISTIENDO y ACTIVO (desactivarlo corta el acceso al
 *    instante, sin esperar a que expire la cookie de 7 días), y
 *  - la versión de sesión del token coincide con la de BD (cambiar la
 *    contraseña incrementa la versión y revoca todos los tokens antiguos).
 *
 * Las rutas API deben usar SIEMPRE este helper, no getSession() directo.
 */
import { prisma } from '@/lib/db';
import { getSession } from './session';

export interface SessionUser {
  id: string;
  nombre: string;
  email: string;
  area: string;
  rol: string;
  activo: boolean;
  created_at: Date;
}

export const getSessionUser = async (): Promise<SessionUser | null> => {
  const session = await getSession();
  if (!session) return null;

  const user = await prisma.users.findUnique({
    where: { id: session.sub },
    select: {
      id: true,
      nombre: true,
      email: true,
      area: true,
      rol: true,
      activo: true,
      created_at: true,
      session_version: true,
    },
  });
  if (!user || user.activo === false) return null;
  if (session.sv !== user.session_version) return null; // token revocado

  return {
    id: user.id,
    nombre: user.nombre,
    email: user.email,
    area: user.area,
    rol: user.rol,
    activo: user.activo,
    created_at: user.created_at,
  };
};
