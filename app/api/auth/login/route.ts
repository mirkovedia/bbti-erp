import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { createSessionToken, SESSION_COOKIE } from '@/lib/auth/session';

const MAX_AGE = 60 * 60 * 24 * 7; // 7 días, igual que la expiración del JWT

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!email || !password) {
      return NextResponse.json({ error: 'Email y contraseña requeridos' }, { status: 400 });
    }

    const user = await prisma.users.findUnique({ where: { email } });
    // Mensaje idéntico exista o no el usuario (no filtrar cuáles emails existen)
    if (!user || user.activo === false || !(await bcrypt.compare(password, user.password_hash))) {
      return NextResponse.json({ error: 'Credenciales incorrectas' }, { status: 401 });
    }

    const token = await createSessionToken({ sub: user.id, rol: user.rol, nombre: user.nombre });
    const res = NextResponse.json({
      user: { id: user.id, nombre: user.nombre, email: user.email, area: user.area, rol: user.rol, activo: user.activo, created_at: user.created_at },
    });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.COOKIE_SECURE === 'true',
      path: '/',
      maxAge: MAX_AGE,
    });
    return res;
  } catch (err) {
    console.error('POST /api/auth/login error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
