import { prisma } from '@/lib/db';

/**
 * Registra un evento en la bitácora general (Command Center).
 * Nunca lanza: un fallo al registrar no debe romper la acción principal.
 */
export async function registrarActividad(params: {
  proyectoId?: string | null;
  cliente?: string | null;
  usuario: string;
  rol: string;
  accion: string;
  detalle: string;
}) {
  try {
    await prisma.actividad_log.create({
      data: {
        proyecto_id: params.proyectoId || null,
        cliente: params.cliente || null,
        usuario: params.usuario,
        rol: params.rol,
        accion: params.accion,
        detalle: params.detalle,
      },
    });
  } catch (err) {
    console.error('Error al registrar actividad:', err);
  }
}
