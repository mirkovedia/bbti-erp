import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('company_config')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data ?? {});
  } catch (err) {
    console.error('GET /api/configuracion error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();

    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }
    const { data: solicitante } = await supabase
      .from('users')
      .select('rol')
      .eq('id', authUser.id)
      .single();
    if (solicitante?.rol !== 'Administrador') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    const body = await request.json();
    const fields = ['name', 'siglas', 'rubro', 'ruc', 'direccion', 'telefono', 'email', 'website', 'moneda', 'igv', 'orden_prefix'];
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const f of fields) {
      if (body[f] !== undefined) updates[f] = body[f];
    }

    // Buscar registro existente
    const { data: existing } = await supabase
      .from('company_config')
      .select('id')
      .limit(1)
      .maybeSingle();

    let result;
    if (existing) {
      result = await supabase
        .from('company_config')
        .update(updates)
        .eq('id', existing.id)
        .select()
        .single();
    } else {
      result = await supabase.from('company_config').insert(updates).select().single();
    }

    if (result.error) {
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }
    return NextResponse.json(result.data);
  } catch (err) {
    console.error('PATCH /api/configuracion error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
