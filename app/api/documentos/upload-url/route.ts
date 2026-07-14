import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSessionUser } from '@/lib/auth/session-user';
import { getR2UploadUrl } from '@/lib/r2/r2Storage';
import { checkUploadPermission } from '@/lib/auth/permissions';
import type { Rol } from '@/types';

// Límite de subida parametrizado por entorno (pedido del ingeniero): MVP 25MB,
// ajustable a 50/100MB sin redeploy de código si los planos reales lo exigen.
const maxUploadMb = (): number => {
  const n = Number(process.env.MAX_UPLOAD_MB);
  return Number.isFinite(n) && n > 0 ? n : 25;
};

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const { proyecto_id, filename, content_type, size } = await request.json();
    if (!proyecto_id || !filename) {
      return NextResponse.json({ error: 'proyecto_id y filename requeridos' }, { status: 400 });
    }
    // Límite server-side: el tamaño declarado viaja firmado en la URL (el
    // storage rechaza cuerpos distintos), así el límite no depende del cliente.
    const maxMb = maxUploadMb();
    if (typeof size !== 'number' || !Number.isFinite(size) || size <= 0 || size > maxMb * 1024 * 1024) {
      return NextResponse.json(
        { error: `Tamaño de archivo inválido (máx. ${maxMb}MB)` },
        { status: 400 }
      );
    }

    if (!checkUploadPermission(user.rol as Rol, filename)) {
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
