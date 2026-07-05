import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const data = await prisma.actividad_log.findMany({
      orderBy: { created_at: 'desc' },
      take: 50,
    });
    return NextResponse.json(data);
  } catch (err) {
    console.error('GET /api/actividad error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
