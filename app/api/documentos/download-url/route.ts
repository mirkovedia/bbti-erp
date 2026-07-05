import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { getR2SignedUrl } from '@/lib/r2/r2Storage';
import { logDocumentoEvento } from '@/lib/documento-eventos';

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const { storage_path } = await request.json();
    if (!storage_path || typeof storage_path !== 'string') {
      return NextResponse.json({ error: 'storage_path requerido' }, { status: 400 });
    }
    const doc = await prisma.proyecto_documentos.findFirst({
      where: { storage_path },
      select: { id: true, nombre: true, proyecto_id: true },
    });
    if (!doc) return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 });

    const url = await getR2SignedUrl(storage_path, 3600, doc.nombre);

    const userData = await prisma.users.findUnique({ where: { id: session.sub }, select: { nombre: true, rol: true } });
    await logDocumentoEvento({
      documentoId: doc.id,
      proyectoId: doc.proyecto_id,
      documentoNombre: doc.nombre,
      tipo: 'descarga',
      usuario: userData?.nombre,
      rol: userData?.rol,
    });

    return NextResponse.json({ url });
  } catch (err) {
    console.error('POST /api/documentos/download-url error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
