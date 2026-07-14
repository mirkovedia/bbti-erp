import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session-user';

// Perfil del usuario de la sesión. getSessionUser verifica contra BD que el
// usuario siga activo y que el token no haya sido revocado (cambio de clave).
export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    return NextResponse.json({ user });
  } catch (err) {
    console.error('GET /api/auth/me error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
