import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSessionUser } from '@/lib/auth/session-user';

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const ids: unknown = body?.ids;

    await prisma.notificaciones.updateMany({
      where: {
        destinatario_id: user.id,
        ...(Array.isArray(ids) && ids.length > 0 ? { id: { in: ids as string[] } } : {}),
      },
      data: { leida: true },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST /api/notificaciones/marcar-leidas error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
