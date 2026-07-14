import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth/session-user';

// Validación de FORMA del backup (restore es destructivo): version presente y
// cada tabla, si viene, debe ser un array de objetos. El contenido fila a fila
// lo valida Prisma contra el schema al insertar.
const tablaSchema = z.array(z.record(z.string(), z.unknown())).optional();
const backupSchema = z.object({
  version: z.string().min(1),
  data: z.object({
    company_config: tablaSchema,
    role_permissions: tablaSchema,
    users: tablaSchema,
    proyectos: tablaSchema,
    proyecto_comercial: tablaSchema,
    proyecto_ingenieria: tablaSchema,
    proyecto_produccion: tablaSchema,
    proyecto_finanzas: tablaSchema,
    proyecto_materiales: tablaSchema,
    proyecto_etapas: tablaSchema,
    proyecto_pagos: tablaSchema,
    proyecto_comentarios: tablaSchema,
    proyecto_observaciones: tablaSchema,
    proyecto_documentos: tablaSchema,
    proyecto_confirmaciones: tablaSchema,
    alertas: tablaSchema,
  }),
});

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    if (user.rol !== 'Administrador') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    const parsed = backupSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Formato de backup inválido o vacío', details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { data } = parsed.data;

    // Zod valida la FORMA (arrays de objetos); el contenido fila a fila lo
    // valida Prisma al insertar — de ahí los casts a los inputs de cada tabla.
    // 1. Configuración de empresa
    if (Array.isArray(data.company_config) && data.company_config.length > 0) {
      await prisma.company_config.deleteMany({});
      await prisma.company_config.createMany({
        data: data.company_config as unknown as Prisma.company_configCreateManyInput[],
      });
    }

    // 2. Permisos por rol
    if (Array.isArray(data.role_permissions) && data.role_permissions.length > 0) {
      for (const rp of data.role_permissions) {
        const fila = rp as unknown as { rol: string; permissions: Prisma.InputJsonValue; updated_at?: string };
        await prisma.role_permissions.upsert({
          where: { rol: fila.rol },
          update: { permissions: fila.permissions, updated_at: fila.updated_at ?? new Date() },
          create: fila,
        });
      }
    }

    // 3. Usuarios (upsert por id para conservar referencias)
    if (Array.isArray(data.users) && data.users.length > 0) {
      for (const u of data.users) {
        const fila = u as unknown as Prisma.usersUncheckedCreateInput & { id: string };
        await prisma.users.upsert({ where: { id: fila.id }, update: fila, create: fila });
      }
    }

    // 4. Limpiar proyectos (las subtablas caen en cascada por FK)
    await prisma.proyectos.deleteMany({});

    // 5. Proyectos base
    if (Array.isArray(data.proyectos) && data.proyectos.length > 0) {
      await prisma.proyectos.createMany({
        data: data.proyectos as unknown as Prisma.proyectosCreateManyInput[],
      });
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
