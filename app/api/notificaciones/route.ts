import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSessionUser } from '@/lib/auth/session-user';

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const [items, count] = await Promise.all([
      prisma.notificaciones.findMany({
        where: { destinatario_id: user.id },
        orderBy: { created_at: 'desc' },
        take: 20,
      }),
      prisma.notificaciones.count({
        where: { destinatario_id: user.id, leida: false },
      }),
    ]);

    return NextResponse.json({ items, unreadCount: count });
  } catch (err) {
    console.error('GET /api/notificaciones error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
