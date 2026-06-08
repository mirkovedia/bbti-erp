import { createAdminClient } from '@/lib/supabase/admin';

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
  } catch (err) {
    console.error('logDocumentoEvento error:', err);
  }
};
