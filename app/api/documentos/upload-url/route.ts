import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { getR2UploadUrl } from '@/lib/r2/r2Storage';
import { checkUploadPermission } from '@/lib/auth/permissions';
import { MAX_FILE_SIZE } from '@/lib/constants';
import type { Rol } from '@/types';

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const { proyecto_id, filename, content_type, size } = await request.json();
    if (!proyecto_id || !filename) {
      return NextResponse.json({ error: 'proyecto_id y filename requeridos' }, { status: 400 });
    }
    // Límite server-side: el tamaño declarado viaja firmado en la URL (el
    // storage rechaza cuerpos distintos), así el 25MB no depende del cliente.
    if (typeof size !== 'number' || !Number.isFinite(size) || size <= 0 || size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'Tamaño de archivo inválido (máx. 25MB)' }, { status: 400 });
    }

    const userData = await prisma.users.findUnique({ where: { id: session.sub }, select: { rol: true } });
    if (!userData) {
      return NextResponse.json({ error: 'Usuario no registrado' }, { status: 403 });
    }
    if (!checkUploadPermission(userData.rol as Rol, filename)) {
      return NextResponse.json({ error: 'No autorizado para subir este tipo de archivo' }, { status: 403 });
    }

    const proyecto = await prisma.proyectos.findUnique({ where: { id: proyecto_id }, select: { id: true } });
    if (!proyecto) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });

    const safe = String(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${proyecto_id}/${crypto.randomUUID()}-${safe}`;

    const url = await getR2UploadUrl(path, typeof content_type === 'string' ? content_type : undefined, size);
    return NextResponse.json({ path, url });
  } catch (err) {
    console.error('POST /api/documentos/upload-url error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
