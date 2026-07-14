import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSessionUser } from '@/lib/auth/session-user';
import { z } from 'zod';
import { PERMS } from '@/lib/auth/permissions';
import { roles } from '@/lib/validations/usuario.schema';

const permissionsSchema = z
  .object({
    canCreate: z.boolean(), canEdit: z.boolean(), canDelete: z.boolean(),
    canManageUsers: z.boolean(), canConfig: z.boolean(), canViewReports: z.boolean(),
    canViewFinance: z.boolean(), canEditFinance: z.boolean(), canEditProduccion: z.boolean(),
    canEditLogistica: z.boolean(), canEditIngenieria: z.boolean(), canEditComercial: z.boolean(),
    canExport: z.boolean(),
  })
  .strict();
const rolePermSchema = z.object({ rol: z.enum(roles), permissions: permissionsSchema });
import type { Rol, Permissions } from '@/types';

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

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
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    if (user.rol !== 'Administrador') {
      return NextResponse.json({ error: 'Acceso denegado. Solo el Administrador puede editar roles.' }, { status: 403 });
    }

    const parsed = rolePermSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'rol o permissions inválidos', details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { rol, permissions } = parsed.data;

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
