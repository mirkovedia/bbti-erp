import { createAdminClient } from '@/lib/supabase/admin';
import type { Rol } from '@/types';
import type { EtapaFlujo } from '@/lib/utils/estado-proyecto';

/** Rol responsable del área de una etapa (para deshacer / pertenencia). */
export const rolDelAreaDeEtapa = (etapa: EtapaFlujo): Rol =>
  etapa === 'ingenieria' ? 'Ingeniería'
  : etapa === 'logistica' ? 'Logística'
  : 'Producción';

/** A qué roles se les avisa cuando se CONFIRMA una etapa (handoff por flujo). */
export const rolesParaConfirmacion = (etapa: EtapaFlujo): Rol[] => {
  switch (etapa) {
    case 'ingenieria': return ['Logística'];
    case 'logistica': return ['Producción'];
    case 'produccion':
    case 'pruebas': return ['Comercial', 'Gerencia General'];
    case 'completado': return ['Comercial', 'Finanzas', 'Gerencia General'];
    default: return [];
  }
};

/** Mensaje legible para la confirmación de una etapa. */
export const mensajeConfirmacion = (etapa: EtapaFlujo, proyectoId: string): string => {
  switch (etapa) {
    case 'ingenieria': return `Ingeniería firmó los planos de ${proyectoId}. Toca compras.`;
    case 'logistica': return `Logística confirmó las compras de ${proyectoId}. Toca producir.`;
    case 'produccion': return `Producción terminó ${proyectoId}. En pruebas.`;
    case 'pruebas': return `${proyectoId} pasó las pruebas. Listo para envío.`;
    case 'completado': return `${proyectoId} fue completado y entregado.`;
    default: return `Avance en ${proyectoId}.`;
  }
};

export interface NotificarInput {
  proyectoId: string;
  tipo: 'documento' | 'confirmacion' | 'datos' | 'hito' | 'vencimiento';
  mensaje: string;
  rolesDestino: Rol[];
  actorId?: string;       // se excluye del fan-out
  actorNombre?: string;
}

/**
 * Crea una notificación por cada usuario activo de rolesDestino (sin el actor).
 * Nunca lanza: un fallo al notificar no debe romper la acción principal.
 */
export const notificar = async (input: NotificarInput): Promise<void> => {
  try {
    if (input.rolesDestino.length === 0) return;
    const admin = createAdminClient();
    const { data: users } = await admin
      .from('users')
      .select('id')
      .in('rol', input.rolesDestino)
      .eq('activo', true);
    const destinatarios = (users ?? []).filter((u) => u.id !== input.actorId);
    if (destinatarios.length === 0) return;
    await admin.from('notificaciones').insert(
      destinatarios.map((u) => ({
        destinatario_id: u.id,
        proyecto_id: input.proyectoId,
        tipo: input.tipo,
        mensaje: input.mensaje,
        actor: input.actorNombre ?? null,
      }))
    );
  } catch (err) {
    console.error('notificar error:', err);
  }
};
