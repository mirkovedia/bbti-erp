import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { createSessionToken, SESSION_COOKIE } from '@/lib/auth/session';
import { isRateLimited, registerFailedAttempt, clearAttempts } from '@/lib/auth/rate-limit';
import { logSecurity } from '@/lib/auth/security-log';

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
});

const MAX_AGE = 60 * 60 * 24 * 7; // 7 días, igual que la expiración del JWT

// Hash bcrypt válido de una cadena aleatoria: iguala el tiempo de respuesta
// cuando el email no existe (sin esto, la latencia del 401 delata cuentas).
const DUMMY_HASH = '$2b$10$xm.95VGqKZ8yzOGKgrcnmOdhNzUmXQYhVNXdAuBJY7MZJggZYfPVy';

// IP del cliente detrás de Traefik (primer valor de X-Forwarded-For).
const clientIp = (request: Request): string =>
  request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'sin-ip';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Email y contraseña requeridos' }, { status: 400 });
    }
    const { email, password } = parsed.data;
    const ip = clientIp(request);

    // Freno a fuerza bruta: 5 intentos fallidos por IP+email cada 15 min
    const rateKey = `${ip}:${email}`;
    if (isRateLimited(rateKey)) {
      await logSecurity({ tipo: 'login_bloqueado', email, ip });
      return NextResponse.json(
        { error: 'Demasiados intentos fallidos. Intenta de nuevo en unos minutos.' },
        { status: 429 }
      );
    }

    const user = await prisma.users.findUnique({ where: { email } });
    // Anti-enumeración: mensaje idéntico Y tiempo idéntico exista o no el usuario.
    const hashToCheck = user && user.activo !== false ? user.password_hash : DUMMY_HASH;
    const passwordOk = await bcrypt.compare(password, hashToCheck);
    if (!user || user.activo === false || !passwordOk) {
      registerFailedAttempt(rateKey);
      await logSecurity({ tipo: 'login_fail', email, ip });
      return NextResponse.json({ error: 'Credenciales incorrectas' }, { status: 401 });
    }
    clearAttempts(rateKey);
    await logSecurity({ tipo: 'login_ok', email, ip });

    const token = await createSessionToken({
      sub: user.id,
      rol: user.rol,
      nombre: user.nombre,
      sv: user.session_version,
    });
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
