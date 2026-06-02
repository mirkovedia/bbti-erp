import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// GET: lista documentos (filtro opcional ?proyecto_id=)
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const proyectoId = new URL(request.url).searchParams.get('proyecto_id');
    let query = supabase
      .from('proyecto_documentos')
      .select('*, proyectos(cliente)')
      .order('created_at', { ascending: false });
    if (proyectoId) query = query.eq('proyecto_id', proyectoId);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

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

// POST: registra los metadatos de un documento ya subido al Storage
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const { proyecto_id, nombre, tipo, storage_path } = await request.json();
    if (typeof proyecto_id !== 'string' || typeof nombre !== 'string' || typeof storage_path !== 'string'
        || !proyecto_id || !nombre || !storage_path) {
      return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 });
    }
    if (nombre.length > 255) {
      return NextResponse.json({ error: 'Nombre demasiado largo' }, { status: 400 });
    }
    // El path debe pertenecer al proyecto (evita asociar archivos de otros proyectos)
    if (!storage_path.startsWith(`${proyecto_id}/`)) {
      return NextResponse.json({ error: 'storage_path inválido para este proyecto' }, { status: 400 });
    }

    const { data: userData } = await supabase
      .from('users').select('nombre').eq('id', user.id).single();

    const { data, error } = await supabase
      .from('proyecto_documentos')
      .insert({
        proyecto_id,
        nombre,
        tipo: tipo ?? null,
        storage_path,
        subido_por: userData?.nombre ?? 'Sistema',
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error('POST /api/documentos error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
