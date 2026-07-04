import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';

// Perfil del usuario de la sesión. Reemplaza la lectura directa de `users`
// que el layout hacía con supabase-js desde el navegador.
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const user = await prisma.users.findUnique({
      where: { id: session.sub },
      select: { id: true, nombre: true, email: true, area: true, rol: true, activo: true, created_at: true },
    });
    if (!user || user.activo === false) {
      return NextResponse.json({ error: 'Usuario no válido' }, { status: 401 });
    }
    return NextResponse.json({ user });
  } catch (err) {
    console.error('GET /api/auth/me error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
