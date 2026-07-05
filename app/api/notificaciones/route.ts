import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const [items, count] = await Promise.all([
      prisma.notificaciones.findMany({
        where: { destinatario_id: session.sub },
        orderBy: { created_at: 'desc' },
        take: 20,
      }),
      prisma.notificaciones.count({
        where: { destinatario_id: session.sub, leida: false },
      }),
    ]);

    return NextResponse.json({ items, unreadCount: count });
  } catch (err) {
    console.error('GET /api/notificaciones error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
