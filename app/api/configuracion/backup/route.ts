import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSessionUser } from '@/lib/auth/session-user';

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    if (user.rol !== 'Administrador') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    // NOTA: users incluye password_hash a propósito — sin él, un restore
    // dejaría a todos sin poder loguearse. El backup es solo-Admin.
    const [company_config, users, proyectos, role_permissions, proyecto_comercial, proyecto_ingenieria, proyecto_materiales, proyecto_produccion, proyecto_etapas, proyecto_finanzas, proyecto_pagos, proyecto_comentarios, proyecto_observaciones, proyecto_documentos, proyecto_confirmaciones, alertas] = await Promise.all([
      prisma.company_config.findMany(),
      prisma.users.findMany(),
      prisma.proyectos.findMany(),
      prisma.role_permissions.findMany(),
      prisma.proyecto_comercial.findMany(),
      prisma.proyecto_ingenieria.findMany(),
      prisma.proyecto_materiales.findMany(),
      prisma.proyecto_produccion.findMany(),
      prisma.proyecto_etapas.findMany(),
      prisma.proyecto_finanzas.findMany(),
      prisma.proyecto_pagos.findMany(),
      prisma.proyecto_comentarios.findMany(),
      prisma.proyecto_observaciones.findMany(),
      prisma.proyecto_documentos.findMany(),
      prisma.proyecto_confirmaciones.findMany(),
      prisma.alertas.findMany(),
    ]);

    return NextResponse.json({
      version: '1.0',
      exportedAt: new Date().toISOString(),
      exportedBy: user.email,
      data: { company_config, users, proyectos, role_permissions, proyecto_comercial, proyecto_ingenieria, proyecto_materiales, proyecto_produccion, proyecto_etapas, proyecto_finanzas, proyecto_pagos, proyecto_comentarios, proyecto_observaciones, proyecto_documentos, proyecto_confirmaciones, alertas },
    });
  } catch (err: unknown) {
    console.error('GET /api/configuracion/backup error:', err);
    const message = err instanceof Error ? err.message : 'Error interno del servidor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
