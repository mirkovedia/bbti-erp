import { createAdminClient } from '@/lib/supabase/admin';
import { registrarActividad } from '@/lib/utils/actividad';

export interface DocEventoInput {
  documentoId?: string | null;
  proyectoId?: string | null;
  documentoNombre: string;
  tipo: 'subida' | 'descarga' | 'eliminacion';
  usuario?: string | null;
  rol?: string | null;
}

/**
 * Registra un evento de documento (subida/descarga/eliminación) en la bitácora.
 * Nunca lanza: un fallo al registrar no debe romper la acción principal.
 */
export const logDocumentoEvento = async (e: DocEventoInput): Promise<void> => {
  try {
    const admin = createAdminClient();
    await admin.from('documento_eventos').insert({
      documento_id: e.documentoId ?? null,
      proyecto_id: e.proyectoId ?? null,
      documento_nombre: e.documentoNombre,
      tipo: e.tipo,
      usuario: e.usuario ?? null,
      rol: e.rol ?? null,
    });

    if (e.proyectoId && (e.tipo === 'subida' || e.tipo === 'eliminacion')) {
      const { data: proy } = await admin
        .from('proyectos')
        .select('cliente')
        .eq('id', e.proyectoId)
        .maybeSingle();

      const verb = e.tipo === 'subida' ? 'subió el documento' : 'eliminó el documento';
      await registrarActividad({
        proyectoId: e.proyectoId,
        cliente: proy?.cliente || null,
        usuario: e.usuario ?? 'Sistema',
        rol: e.rol ?? 'Sistema',
        accion: e.tipo === 'subida' ? 'documento_subida' : 'documento_eliminacion',
        detalle: `${verb} "${e.documentoNombre}"`,
      });
    }
  } catch (err) {
    console.error('logDocumentoEvento error:', err);
  }
};
