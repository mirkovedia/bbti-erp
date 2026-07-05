import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { getRolePermissionsServer } from '@/lib/auth/permissions-server';
import { aplicarRetraso, computeEstadoFromConfirmaciones, type EtapaFlujo } from '@/lib/utils/estado-proyecto';
import { notificar } from '@/lib/notificaciones';
import { registrarActividad } from '@/lib/utils/actividad';
import type { Rol } from '@/types';

export async function GET(request: Request) {
  try {
    // Antes protegido por RLS; con Prisma el check de sesión es explícito.
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const verPapelera = new URL(request.url).searchParams.get('papelera') === '1';

    const proyectos = await prisma.proyectos.findMany({
      where: { activo: !verPapelera },
      include: {
        comercial: { select: { fecha_entrega: true, dias_plazo: true, adelanto: true, adelanto_fijado: true, metrado: true, alerta: true } },
        produccion: { select: { progreso: true } },
        confirmaciones: { select: { etapa: true, confirmada_por: true, confirmada_at: true } },
      },
      orderBy: { created_at: 'desc' },
    });

    const hoy = new Date().toISOString().split('T')[0];
    const formatted = proyectos.map((p) => {
      const confirmadas = new Set<EtapaFlujo>(p.confirmaciones.map((c) => c.etapa as EtapaFlujo));
      const estadoBase = computeEstadoFromConfirmaciones(confirmadas);
      return { ...p, estado: aplicarRetraso(estadoBase, p.comercial?.fecha_entrega, hoy) };
    });

    return NextResponse.json(formatted);
  } catch (err) {
    console.error('GET /api/proyectos error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const body = await request.json();
    if (typeof body.cliente !== 'string' || !body.cliente.trim()) {
      return NextResponse.json({ error: 'El cliente es requerido', code: 'VALIDATION_ERROR' }, { status: 400 });
    }

    const config = await prisma.company_config.findFirst({ select: { orden_prefix: true } });
    const prefix = config?.orden_prefix || 'PR';

    // ID por máximo correlativo del año (evita colisiones tras borrados)
    const year = new Date().getFullYear();
    const delAnio = await prisma.proyectos.findMany({
      where: { id: { startsWith: `${prefix}-`, endsWith: `-${year}` } },
      select: { id: true },
    });
    const maxCorrelativo = delAnio.reduce((max, p) => {
      const parts = p.id.split('-');
      if (parts.length >= 3 && parts[0] === prefix) {
        const n = parseInt(parts[1], 10);
        return Number.isFinite(n) && n > max ? n : max;
      }
      return max;
    }, 0);
    const nextNum = String(maxCorrelativo + 1).padStart(2, '0');
    const id = `${prefix}-${nextNum}-${year}`;

    const userData = await prisma.users.findUnique({
      where: { id: session.sub },
      select: { nombre: true, rol: true },
    });
    const rol = userData?.rol as Rol | undefined;
    const permsMap = await getRolePermissionsServer();
    if (!rol || !permsMap[rol]?.canCreate) {
      return NextResponse.json({ error: 'No tienes permiso para crear proyectos' }, { status: 403 });
    }

    const etapasDefault = [
      'Habilitación de material',
      'Área de Corte',
      'Área de Doblez',
      'Área de Soldadura',
      'Área de Pintura',
      'Área de Electricidad',
      'Área de Ensamblaje',
    ];

    // Proyecto + sub-tablas en una transacción: si falla alguna escritura, rollback total
    let data;
    try {
      data = await prisma.$transaction(async (tx) => {
        const proyecto = await tx.proyectos.create({
          data: {
            id,
            cliente: body.cliente,
            fecha_creacion: new Date().toISOString().split('T')[0],
            monto: body.monto || 0,
            usuario_id: session.sub,
            usuario_nombre: userData?.nombre || 'Sistema',
            estado: 'EN INGENIERÍA', // el estado es automático; un proyecto nuevo arranca en Ingeniería
          },
        });

        // Sub-tablas independientes entre sí → en paralelo
        await Promise.all([
          body.fecha_entrega || body.dias_plazo || body.adelanto
            ? tx.proyecto_comercial.create({
                data: {
                  proyecto_id: id,
                  fecha_entrega: body.fecha_entrega || null,
                  dias_plazo: body.dias_plazo || null,
                  adelanto: body.adelanto || 0,
                  metrado: body.metrado || '',
                },
              })
            : Promise.resolve(null),
          tx.proyecto_etapas.createMany({
            data: etapasDefault.map((nombre, i) => ({ proyecto_id: id, nombre, orden: i + 1, estado: 'PENDIENTE' })),
          }),
          tx.proyecto_ingenieria.create({ data: { proyecto_id: id, estado_planos: 'Solicitud de planos' } }),
          tx.proyecto_produccion.create({ data: { proyecto_id: id, progreso: 0, pruebas: false, envio: false } }),
          tx.proyecto_finanzas.create({ data: { proyecto_id: id, adelanto: body.adelanto || 0, porcentaje: 0 } }),
        ]);

        return proyecto;
      });
    } catch (e: unknown) {
      // P2002 = colisión de PK: dos POST simultáneos calcularon el mismo correlativo
      if (typeof e === 'object' && e !== null && 'code' in e && (e as { code: string }).code === 'P2002') {
        return NextResponse.json(
          { error: 'Conflicto al generar el ID del proyecto, intenta de nuevo', code: 'ID_CONFLICT' },
          { status: 409 }
        );
      }
      throw e;
    }

    // Bitácora fuera de la transacción: solo se registra si el proyecto se creó
    await registrarActividad({
      proyectoId: id,
      cliente: body.cliente,
      usuario: userData?.nombre || 'Sistema',
      rol: rol || 'Sistema',
      accion: 'creacion',
      detalle: `creó la orden de proyecto para el cliente ${body.cliente}`,
    });

    await notificar({
      proyectoId: id,
      tipo: 'hito',
      mensaje: `Nuevo proyecto ${id} (${body.cliente}) creado. Inicien los planos.`,
      rolesDestino: ['Ingeniería'],
      actorId: session.sub,
      actorNombre: userData?.nombre,
    });

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error('POST /api/proyectos error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
