import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Registra un evento en la bitácora general (Command Center).
 * Escribe con service role: la RLS de actividad_log es de SOLO lectura
 * (patrón del sistema: el backend escribe, los clientes solo leen).
 * OJO: supabase-js NO lanza en errores de query — hay que leer `error`,
 * si no el fallo es silencioso (así se congeló el feed la primera vez).
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
    const supabase = createAdminClient();
    const { error } = await supabase.from('actividad_log').insert({
      proyecto_id: params.proyectoId || null,
      cliente: params.cliente || null,
      usuario: params.usuario,
      rol: params.rol,
      accion: params.accion,
      detalle: params.detalle,
    });
    if (error) {
      console.error('Error al registrar actividad:', error.message);
    }
  } catch (err) {
    console.error('Error al registrar actividad:', err);
  }
}
