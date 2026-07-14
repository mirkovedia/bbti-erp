import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { getSessionUser } from '@/lib/auth/session-user';
import { logSecurity } from '@/lib/auth/security-log';
import { roles } from '@/lib/validations/usuario.schema';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const solicitante = await getSessionUser();
    if (!solicitante) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    if (solicitante.rol !== 'Administrador') {
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

    // Guard anti "sistema sin admins": un Administrador no puede quitarse a sí
    // mismo el rol ni desactivarse — otro admin debe hacerlo.
    if (id === solicitante.id && (updates.activo === false || (updates.rol && updates.rol !== 'Administrador'))) {
      return NextResponse.json(
        { error: 'No puedes desactivarte ni quitarte el rol de Administrador a ti mismo' },
        { status: 400 }
      );
    }

    // Cambio de contraseña opcional. Mínimo 12 (política de seguridad) y
    // además incrementa session_version: revoca TODAS las sesiones activas
    // del usuario (una cookie robada muere al instante).
    const cambiaPassword = typeof body.password === 'string' && body.password.length > 0;
    if (cambiaPassword) {
      if (body.password.length < 12) {
        return NextResponse.json({ error: 'La contraseña debe tener al menos 12 caracteres' }, { status: 400 });
      }
      updates.password_hash = await bcrypt.hash(body.password, 10);
      updates.session_version = { increment: 1 };
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 });
    }

    try {
      const data = await prisma.users.update({
        where: { id },
        // updates se arma campo a campo validado arriba; el cast evita el choque
        // Record<string, unknown> vs input tipado de Prisma.
        data: updates as Prisma.usersUncheckedUpdateInput,
        select: { id: true, nombre: true, email: true, area: true, rol: true, activo: true },
      });
      if (cambiaPassword) {
        await logSecurity({ tipo: 'password_cambiada', email: data.email, detalle: `por ${solicitante.nombre}` });
      }
      if (updates.activo === false) {
        await logSecurity({ tipo: 'usuario_desactivado', email: data.email, detalle: `por ${solicitante.nombre}` });
      }
      return NextResponse.json(data);
    } catch (e: unknown) {
      // P2025 = la fila no existe → 404 en vez de 500 genérico
      if (typeof e === 'object' && e !== null && 'code' in e && (e as { code: string }).code === 'P2025') {
        return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
      }
      throw e;
    }
  } catch (err) {
    console.error('PATCH /api/usuarios/[id] error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
