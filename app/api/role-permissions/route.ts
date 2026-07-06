import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { PERMS } from '@/lib/auth/permissions';
import type { Rol, Permissions } from '@/types';

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const data = await prisma.role_permissions.findMany({ select: { rol: true, permissions: true } });

    const map = {} as Record<Rol, Permissions>;
    for (const r of data) {
      map[r.rol as Rol] = r.permissions as unknown as Permissions;
    }
    for (const r of Object.keys(PERMS) as Rol[]) {
      if (!map[r]) map[r] = PERMS[r];
    }
    return NextResponse.json(map);
  } catch (err) {
    console.error('GET /api/role-permissions error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const userData = await prisma.users.findUnique({ where: { id: session.sub }, select: { rol: true } });
    if (!userData || userData.rol !== 'Administrador') {
      return NextResponse.json({ error: 'Acceso denegado. Solo el Administrador puede editar roles.' }, { status: 403 });
    }

    const { rol, permissions } = await request.json();
    if (!rol || !permissions) {
      return NextResponse.json({ error: 'rol y permissions requeridos' }, { status: 400 });
    }

    await prisma.role_permissions.upsert({
      where: { rol },
      update: { permissions, updated_at: new Date() },
      create: { rol, permissions },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('PATCH /api/role-permissions error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
