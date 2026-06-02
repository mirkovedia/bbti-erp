import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

const BUCKET = 'bbti-documentos';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }
    const { data, error } = await supabase
      .from('proyecto_documentos')
      .select('*, proyectos(cliente)')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const docs = (data ?? []).map((d) => ({
      id: d.id,
      proyecto_id: d.proyecto_id,
      cliente: d.proyectos?.cliente ?? '',
      nombre: d.nombre,
      tipo: d.tipo,
      storage_path: d.storage_path,
      subido_por: d.subido_por,
      created_at: d.created_at,
    }));
    return NextResponse.json(docs);
  } catch (err) {
    console.error('GET /api/documentos error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

// Genera una URL firmada (válida 1 hora) para descargar un documento.
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const { storage_path } = await request.json();
    if (!storage_path || typeof storage_path !== 'string') {
      return NextResponse.json({ error: 'storage_path requerido' }, { status: 400 });
    }
    // Evita path traversal: el path debe existir como documento registrado
    const { data: doc } = await supabase
      .from('proyecto_documentos')
      .select('id')
      .eq('storage_path', storage_path)
      .maybeSingle();
    if (!doc) {
      return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 });
    }

    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(storage_path, 3600);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ url: data.signedUrl });
  } catch (err) {
    console.error('POST /api/documentos error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
