import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { DOCUMENTOS_BUCKET } from '@/lib/constants';
import { logDocumentoEvento } from '@/lib/documento-eventos';
import { NextResponse } from 'next/server';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const { data: userData } = await supabase
      .from('users').select('nombre, rol').eq('id', user.id).single();
    if (userData?.rol !== 'Administrador') {
      return NextResponse.json({ error: 'Solo administradores pueden eliminar documentos' }, { status: 403 });
    }

    const { data: doc } = await supabase
      .from('proyecto_documentos').select('storage_path, nombre, proyecto_id').eq('id', id).maybeSingle();
    if (!doc) return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 });

    const admin = createAdminClient();
    if (doc.storage_path) {
      const { error: storageErr } = await admin.storage.from(DOCUMENTOS_BUCKET).remove([doc.storage_path]);
      if (storageErr) console.error('Storage remove falló:', storageErr.message);
    }
    const { error } = await admin.from('proyecto_documentos').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Registrar la eliminación (sobrevive al borrado del doc).
    await logDocumentoEvento({
      documentoId: id,
      proyectoId: doc.proyecto_id,
      documentoNombre: doc.nombre,
      tipo: 'eliminacion',
      usuario: userData?.nombre,
      rol: userData?.rol,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/documentos/[id] error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
