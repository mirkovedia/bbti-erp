import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const solicitante = await prisma.users.findUnique({ where: { id: session.sub }, select: { rol: true } });
    if (solicitante?.rol !== 'Administrador') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    const { version, data } = await request.json();
    if (!version || !data) {
      return NextResponse.json({ error: 'Formato de backup inválido o vacío' }, { status: 400 });
    }

    // 1. Configuración de empresa
    if (Array.isArray(data.company_config) && data.company_config.length > 0) {
      await prisma.company_config.deleteMany({});
      await prisma.company_config.createMany({ data: data.company_config });
    }

    // 2. Permisos por rol
    if (Array.isArray(data.role_permissions) && data.role_permissions.length > 0) {
      for (const rp of data.role_permissions) {
        await prisma.role_permissions.upsert({
          where: { rol: rp.rol },
          update: { permissions: rp.permissions, updated_at: rp.updated_at ?? new Date() },
          create: rp,
        });
      }
    }

    // 3. Usuarios (upsert por id para conservar referencias)
    if (Array.isArray(data.users) && data.users.length > 0) {
      for (const u of data.users) {
        await prisma.users.upsert({ where: { id: u.id }, update: u, create: u });
      }
    }

    // 4. Limpiar proyectos (las subtablas caen en cascada por FK)
    await prisma.proyectos.deleteMany({});

    // 5. Proyectos base
    if (Array.isArray(data.proyectos) && data.proyectos.length > 0) {
      await prisma.proyectos.createMany({ data: data.proyectos });
    }

    // 6. Subtablas en orden
    const subtables = [
      'proyecto_comercial', 'proyecto_ingenieria', 'proyecto_produccion', 'proyecto_finanzas',
      'proyecto_materiales', 'proyecto_etapas', 'proyecto_pagos', 'proyecto_comentarios',
      'proyecto_observaciones', 'proyecto_documentos', 'proyecto_confirmaciones', 'alertas',
    ] as const;
    for (const table of subtables) {
      const list = data[table];
      if (Array.isArray(list) && list.length > 0) {
        // acceso dinámico al modelo homónimo del cliente Prisma
        await (prisma[table] as unknown as { createMany: (args: { data: unknown[] }) => Promise<unknown> }).createMany({ data: list });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error('POST /api/configuracion/restore error:', err);
    const message = err instanceof Error ? err.message : 'Error durante la restauración';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
