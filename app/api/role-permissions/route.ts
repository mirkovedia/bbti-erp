import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { PERMS } from '@/lib/auth/permissions';
import type { Rol, Permissions } from '@/types';

// GET: Retorna el mapa completo de permisos por rol
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const { data, error } = await supabase.from('role_permissions').select('rol, permissions');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const map = {} as Record<Rol, Permissions>;
    for (const r of data ?? []) {
      map[r.rol as Rol] = r.permissions as Permissions;
    }

    // Rellenar con los estáticos si falta alguno
    for (const r of Object.keys(PERMS) as Rol[]) {
      if (!map[r]) {
        map[r] = PERMS[r];
      }
    }

    return NextResponse.json(map);
  } catch (err) {
    console.error('GET /api/role-permissions error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

// PATCH: Actualiza los permisos de un rol específico (Solo Administrador)
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    // Verificar que el usuario tenga rol Administrador
    const { data: userData } = await supabase
      .from('users')
      .select('rol')
      .eq('id', user.id)
      .single();

    if (!userData || userData.rol !== 'Administrador') {
      return NextResponse.json({ error: 'Acceso denegado. Solo el Administrador puede editar roles.' }, { status: 403 });
    }

    const { rol, permissions } = await request.json();
    if (!rol || !permissions) {
      return NextResponse.json({ error: 'rol y permissions requeridos' }, { status: 400 });
    }

    const { error } = await supabase
      .from('role_permissions')
      .upsert({ rol, permissions, updated_at: new Date().toISOString() }, { onConflict: 'rol' });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('PATCH /api/role-permissions error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
