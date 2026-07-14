import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSessionUser } from '@/lib/auth/session-user';

// Bitácora de actividad de documentos (últimos 100 eventos). Visible para autenticados.
export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const data = await prisma.documento_eventos.findMany({
      orderBy: { created_at: 'desc' },
      take: 100,
    });
    return NextResponse.json(data);
  } catch (err) {
    console.error('GET /api/documentos/eventos error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
