import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { getSessionUser } from '@/lib/auth/session-user';
import { createSessionToken, SESSION_COOKIE } from '@/lib/auth/session';
import { isRateLimited, registerFailedAttempt, clearAttempts } from '@/lib/auth/rate-limit';
import { logSecurity } from '@/lib/auth/security-log';

const MAX_AGE = 60 * 60 * 24 * 7; // 7 días, igual que login

const cambioSchema = z.object({
  actual: z.string().min(1).max(200),
  nueva: z.string().min(12, 'La contraseña nueva debe tener al menos 12 caracteres').max(200),
});

/**
 * Cambio de contraseña por el PROPIO usuario.
 * - Exige la contraseña actual (una sesión robada no basta para tomar la cuenta)
 *   y la protege con rate-limit: 5 intentos fallidos → 429 (anti fuerza bruta).
 * - Incrementa session_version: TODAS las demás sesiones del usuario quedan
 *   revocadas al instante; esta sesión recibe una cookie nueva y sigue viva.
 */
export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const parsed = cambioSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message || 'Datos inválidos';
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    const { actual, nueva } = parsed.data;

    const rateKey = `pwd:${user.id}`;
    if (isRateLimited(rateKey)) {
      await logSecurity({ tipo: 'login_bloqueado', email: user.email, detalle: 'cambio de contraseña bloqueado por intentos' });
      return NextResponse.json(
        { error: 'Demasiados intentos fallidos. Intenta de nuevo en unos minutos.' },
        { status: 429 }
      );
    }

    const fila = await prisma.users.findUnique({
      where: { id: user.id },
      select: { password_hash: true },
    });
    if (!fila || !(await bcrypt.compare(actual, fila.password_hash))) {
      registerFailedAttempt(rateKey);
      await logSecurity({ tipo: 'login_fail', email: user.email, detalle: 'contraseña actual incorrecta en cambio de clave' });
      return NextResponse.json({ error: 'La contraseña actual es incorrecta' }, { status: 400 });
    }
    clearAttempts(rateKey);

    const password_hash = await bcrypt.hash(nueva, 10);
    const actualizado = await prisma.users.update({
      where: { id: user.id },
      data: { password_hash, session_version: { increment: 1 } },
      select: { session_version: true },
    });
    await logSecurity({ tipo: 'password_cambiada', email: user.email, detalle: 'por el propio usuario' });

    // Cookie nueva con la versión incrementada: esta sesión continúa,
    // cualquier otra (incluida una robada) queda muerta.
    const token = await createSessionToken({
      sub: user.id,
      rol: user.rol,
      nombre: user.nombre,
      sv: actualizado.session_version,
    });
    const res = NextResponse.json({ success: true });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.COOKIE_SECURE === 'true',
      path: '/',
      maxAge: MAX_AGE,
    });
    return res;
  } catch (err) {
    console.error('POST /api/auth/cambiar-password error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
