import { createClient } from '@/lib/supabase/server';

export async function registrarActividad(params: {
  proyectoId?: string | null;
  cliente?: string | null;
  usuario: string;
  rol: string;
  accion: string;
  detalle: string;
}) {
  try {
    const supabase = await createClient();
    await supabase.from('actividad_log').insert({
      proyecto_id: params.proyectoId || null,
      cliente: params.cliente || null,
      usuario: params.usuario,
      rol: params.rol,
      accion: params.accion,
      detalle: params.detalle,
    });
  } catch (err) {
    console.error('Error al registrar actividad:', err);
  }
}
