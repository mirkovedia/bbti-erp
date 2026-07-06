import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { deleteFromR2 } from '@/lib/r2/r2Storage';
import { logDocumentoEvento } from '@/lib/documento-eventos';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const userData = await prisma.users.findUnique({ where: { id: session.sub }, select: { nombre: true, rol: true } });
    if (userData?.rol !== 'Administrador') {
      return NextResponse.json({ error: 'Solo administradores pueden eliminar documentos' }, { status: 403 });
    }

    const doc = await prisma.proyecto_documentos.findUnique({
      where: { id },
      select: { storage_path: true, nombre: true, proyecto_id: true },
    });
    if (!doc) return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 });

    if (doc.storage_path) {
      try {
        await deleteFromR2(doc.storage_path);
      } catch (storageErr) {
        console.error('R2 delete falló:', storageErr); // metadatos se borran igual (paridad con hoy)
      }
    }
    await prisma.proyecto_documentos.delete({ where: { id } });

    await logDocumentoEvento({
      documentoId: id,
      proyectoId: doc.proyecto_id,
      documentoNombre: doc.nombre,
      tipo: 'eliminacion',
      usuario: userData?.nombre,
      rol: userData?.rol,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/documentos/[id] error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
