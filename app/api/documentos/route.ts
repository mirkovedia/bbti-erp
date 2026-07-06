import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { notificar } from '@/lib/notificaciones';
import { logDocumentoEvento } from '@/lib/documento-eventos';
import { DOC_PREFIX } from '@/lib/constants';
import type { Rol } from '@/types';
import { checkUploadPermission } from '@/lib/auth/permissions';

// GET: lista documentos (filtro opcional ?proyecto_id=)
export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const proyectoId = new URL(request.url).searchParams.get('proyecto_id');
    const data = await prisma.proyecto_documentos.findMany({
      where: proyectoId ? { proyecto_id: proyectoId } : undefined,
      include: { proyecto: { select: { cliente: true } } },
      orderBy: { created_at: 'desc' },
    });

    const docs = data.map((d) => ({
      id: d.id,
      proyecto_id: d.proyecto_id,
      cliente: d.proyecto?.cliente ?? '',
      nombre: d.nombre,
      tipo: d.tipo,
      storage_path: d.storage_path,
      subido_por: d.subido_por,
      subido_por_rol: d.subido_por_rol,
      created_at: d.created_at,
    }));
    return NextResponse.json(docs);
  } catch (err) {
    console.error('GET /api/documentos error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

// POST: registra los metadatos de un documento ya subido a R2
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const { proyecto_id, nombre, tipo, storage_path } = await request.json();
    if (typeof proyecto_id !== 'string' || typeof nombre !== 'string' || typeof storage_path !== 'string'
        || !proyecto_id || !nombre || !storage_path) {
      return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 });
    }
    if (nombre.length > 255) {
      return NextResponse.json({ error: 'Nombre demasiado largo' }, { status: 400 });
    }
    if (!storage_path.startsWith(`${proyecto_id}/`)) {
      return NextResponse.json({ error: 'storage_path inválido para este proyecto' }, { status: 400 });
    }

    const userData = await prisma.users.findUnique({ where: { id: session.sub }, select: { nombre: true, rol: true } });
    if (!userData) {
      return NextResponse.json({ error: 'Usuario no registrado' }, { status: 403 });
    }
    if (!checkUploadPermission(userData.rol as Rol, nombre)) {
      return NextResponse.json({ error: 'No autorizado para registrar este tipo de archivo' }, { status: 403 });
    }

    const data = await prisma.proyecto_documentos.create({
      data: {
        proyecto_id,
        nombre,
        tipo: tipo ?? null,
        storage_path,
        subido_por: userData.nombre ?? 'Sistema',
        subido_por_rol: userData.rol ?? null,
      },
    });

    await logDocumentoEvento({
      documentoId: data.id,
      proyectoId: proyecto_id,
      documentoNombre: nombre,
      tipo: 'subida',
      usuario: userData.nombre,
      rol: userData.rol,
    });

    // Enrutamiento del aviso por prefijo del nombre (igual que hoy)
    let rolesDestino: Rol[] = ['Comercial'];
    if (nombre.startsWith(DOC_PREFIX.comprobante)) rolesDestino = ['Finanzas'];
    else if (nombre.startsWith(DOC_PREFIX.oc) || nombre.startsWith(DOC_PREFIX.especificaciones)) rolesDestino = ['Ingeniería'];
    else if (nombre.startsWith(DOC_PREFIX.despiece)) rolesDestino = ['Producción'];

    await notificar({
      proyectoId: proyecto_id,
      tipo: 'documento',
      mensaje: `${userData.nombre ?? 'Alguien'} subió "${nombre}" a ${proyecto_id}.`,
      rolesDestino,
      actorId: session.sub,
      actorNombre: userData.nombre,
    });

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error('POST /api/documentos error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
