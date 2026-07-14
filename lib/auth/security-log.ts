/**
 * Bitácora de eventos de seguridad (tabla security_log): logins, bloqueos por
 * rate-limit, cambios de contraseña y desactivaciones. NO es el feed de
 * negocio (actividad_log) — se consulta con SQL/Prisma cuando haga falta
 * investigar un incidente.
 * Nunca lanza: registrar no debe romper la acción principal.
 */
import { prisma } from '@/lib/db';

export type TipoEventoSeguridad =
  | 'login_ok'
  | 'login_fail'
  | 'login_bloqueado'
  | 'password_cambiada'
  | 'usuario_desactivado';

export const logSecurity = async (e: {
  tipo: TipoEventoSeguridad;
  email?: string | null;
  ip?: string | null;
  detalle?: string | null;
}): Promise<void> => {
  try {
    await prisma.security_log.create({
      data: {
        tipo: e.tipo,
        email: e.email ?? null,
        ip: e.ip ?? null,
        detalle: e.detalle ?? null,
      },
    });
  } catch (err) {
    console.error('logSecurity error:', err);
  }
};
