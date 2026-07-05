import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { roles } from '@/lib/validations/usuario.schema';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const solicitante = await prisma.users.findUnique({ where: { id: session.sub }, select: { rol: true } });
    if (solicitante?.rol !== 'Administrador') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    const body = await request.json();
    const updates: Record<string, unknown> = {};
    if (typeof body.activo === 'boolean') updates.activo = body.activo;
    if (typeof body.nombre === 'string') updates.nombre = body.nombre;
    if (typeof body.area === 'string') updates.area = body.area;
    if (typeof body.rol === 'string') {
      if (!roles.includes(body.rol)) {
        return NextResponse.json({ error: 'Rol inválido' }, { status: 400 });
      }
      updates.rol = body.rol;
    }
    // Cambio de contraseña opcional (antes lo hacía el Admin API de Supabase)
    if (typeof body.password === 'string' && body.password.length > 0) {
      if (body.password.length < 6) {
        return NextResponse.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, { status: 400 });
      }
      updates.password_hash = await bcrypt.hash(body.password, 10);
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 });
    }

    const data = await prisma.users.update({
      where: { id },
      // updates se arma campo a campo validado arriba; el cast evita el choque
      // Record<string, unknown> vs input tipado de Prisma.
      data: updates as Prisma.usersUncheckedUpdateInput,
      select: { id: true, nombre: true, email: true, area: true, rol: true, activo: true },
    });
    return NextResponse.json(data);
  } catch (err) {
    console.error('PATCH /api/usuarios/[id] error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
