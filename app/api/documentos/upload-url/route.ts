import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { DOCUMENTOS_BUCKET } from '@/lib/constants';
import { NextResponse } from 'next/server';
import { checkUploadPermission } from '@/lib/auth/permissions';
import type { Rol } from '@/types';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const { proyecto_id, filename } = await request.json();
    if (!proyecto_id || !filename) {
      return NextResponse.json({ error: 'proyecto_id y filename requeridos' }, { status: 400 });
    }

    const { data: userData } = await supabase
      .from('users').select('rol').eq('id', user.id).single();
    if (!userData) {
      return NextResponse.json({ error: 'Usuario no registrado' }, { status: 403 });
    }

    if (!checkUploadPermission(userData.rol as Rol, filename)) {
      return NextResponse.json({ error: 'No autorizado para subir este tipo de archivo' }, { status: 403 });
    }

    const { data: proyecto } = await supabase
      .from('proyectos').select('id').eq('id', proyecto_id).maybeSingle();
    if (!proyecto) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });

    const safe = String(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${proyecto_id}/${crypto.randomUUID()}-${safe}`;

    const admin = createAdminClient();
    const { data, error } = await admin.storage
      .from(DOCUMENTOS_BUCKET)
      .createSignedUploadUrl(path);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ path: data.path, token: data.token });
  } catch (err) {
    console.error('POST /api/documentos/upload-url error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
