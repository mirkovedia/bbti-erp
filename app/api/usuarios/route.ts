import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { usuarioSchema } from '@/lib/validations/usuario.schema';

const SAFE_FIELDS = { id: true, nombre: true, email: true, area: true, rol: true, activo: true, created_at: true } as const;

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const data = await prisma.users.findMany({
      select: SAFE_FIELDS,
      orderBy: { created_at: 'asc' },
    });
    return NextResponse.json(data);
  } catch (err) {
    console.error('GET /api/usuarios error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const solicitante = await prisma.users.findUnique({ where: { id: session.sub }, select: { rol: true } });
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

    const password_hash = await bcrypt.hash(password, 10);
    try {
      const data = await prisma.users.create({
        data: { nombre, email: email.toLowerCase(), area, rol, activo: true, password_hash },
        select: { id: true, nombre: true, email: true, area: true, rol: true, activo: true },
      });
      return NextResponse.json(data, { status: 201 });
    } catch (e: unknown) {
      // P2002 = unique violation (email duplicado)
      if (typeof e === 'object' && e !== null && 'code' in e && (e as { code: string }).code === 'P2002') {
        return NextResponse.json({ error: 'Ya existe un usuario con ese email' }, { status: 400 });
      }
      throw e;
    }
  } catch (err) {
    console.error('POST /api/usuarios error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
