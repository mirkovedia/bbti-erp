import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { usuarioSchema } from '@/lib/validations/usuario.schema';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('users')
      .select('id, nombre, email, area, rol, activo, created_at')
      .order('created_at', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data);
  } catch (err) {
    console.error('GET /api/usuarios error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    // Verificar que el solicitante sea Administrador
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
    const parsed = usuarioSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { nombre, email, area, rol, password } = parsed.data;

    const admin = createAdminClient();

    // Crear en auth.users
    const { data: created, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (authError || !created.user) {
      return NextResponse.json({ error: authError?.message ?? 'Error creando usuario' }, { status: 400 });
    }

    // Insertar en tabla users
    const { data, error } = await admin
      .from('users')
      .insert({ id: created.user.id, nombre, email, area, rol, activo: true })
      .select('id, nombre, email, area, rol, activo')
      .single();

    if (error) {
      // Rollback del auth user si falla el insert
      await admin.auth.admin.deleteUser(created.user.id);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error('POST /api/usuarios error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
