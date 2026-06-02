import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { DOCUMENTOS_BUCKET } from '@/lib/constants';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const { storage_path } = await request.json();
    if (!storage_path || typeof storage_path !== 'string') {
      return NextResponse.json({ error: 'storage_path requerido' }, { status: 400 });
    }
    const { data: doc } = await supabase
      .from('proyecto_documentos').select('id').eq('storage_path', storage_path).maybeSingle();
    if (!doc) return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 });

    const admin = createAdminClient();
    const { data, error } = await admin.storage
      .from(DOCUMENTOS_BUCKET).createSignedUrl(storage_path, 3600);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ url: data.signedUrl });
  } catch (err) {
    console.error('POST /api/documentos/download-url error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
