import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getSessionUser } from '@/lib/auth/session-user';
import { getRolePermissionsServer } from '@/lib/auth/permissions-server';
import { registrarActividad } from '@/lib/utils/actividad';
import {
  aplicarRetraso,
  computeEstadoFromConfirmaciones,
  computeReadiness,
  cascadeEtapas,
  permsForEtapa,
  FLOW_ETAPAS,
  type EtapaFlujo,
} from '@/lib/utils/estado-proyecto';
import { notificar, rolesParaConfirmacion, mensajeConfirmacion, rolDelAreaDeEtapa } from '@/lib/notificaciones';
import type { Permissions, Rol } from '@/types';

// Toma solo las claves permitidas de un objeto del body (tolerancia a payloads
// con claves extra, como hacía PostgREST; Prisma lanzaría ante columnas desconocidas).
const pick = (obj: Record<string, unknown>, keys: string[]): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
};

const COMERCIAL_KEYS = ['fecha_entrega', 'dias_plazo', 'adelanto', 'adelanto_fijado', 'metrado', 'alerta'];
const INGENIERIA_KEYS = ['estado_planos'];
const PRODUCCION_KEYS = ['progreso', 'pruebas', 'envio'];
const FINANZAS_KEYS = ['adelanto', 'fecha_adelanto', 'porcentaje', 'forma_pago', 'alerta'];

// Proyecto completo (todas las áreas) en un solo query con relaciones.
async function buildFullProyecto(id: string) {
  const p = await prisma.proyectos.findUnique({
    where: { id },
    include: {
      comercial: true,
      ingenieria: true,
      materiales: { orderBy: { id: 'asc' } },
      produccion: true,
      etapas: { orderBy: { orden: 'asc' } },
      finanzas: true,
      pagos: { orderBy: { fecha: 'asc' } },
      comentarios: { orderBy: { fecha: 'desc' } },
      observaciones: { orderBy: { fecha: 'desc' } },
      documentos: { orderBy: { created_at: 'desc' } },
      confirmaciones: true,
    },
  });
  if (!p) return null;

  const { comercial, ingenieria, materiales, produccion, etapas, finanzas, pagos, comentarios, observaciones, documentos, confirmaciones, ...proyecto } = p;

  const fullProyecto = {
    ...proyecto,
    comercial: comercial ? { ...comercial, comentarios } : null,
    ingenieria: ingenieria ? { ...ingenieria, observaciones } : null,
    logistica: { materiales },
    produccion: produccion ? { ...produccion, etapas } : null,
    finanzas: finanzas ? { ...finanzas, pagos } : null,
    documentos,
    confirmaciones,
    estado: proyecto.estado,
  };

  const hoy = new Date().toISOString().split('T')[0];
  const confirmadas = new Set(confirmaciones.map((c) => c.etapa as EtapaFlujo));
  const estadoBase = computeEstadoFromConfirmaciones(confirmadas);
  fullProyecto.estado = aplicarRetraso(estadoBase, comercial?.fecha_entrega, hoy);
  return fullProyecto;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const { id } = await params;
    const full = await buildFullProyecto(id);
    if (!full) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
    return NextResponse.json(full);
  } catch (err) {
    console.error('GET /api/proyectos/[id] error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const body = await request.json();

    const rol = user.rol as Rol;
    const permsMap = await getRolePermissionsServer();
    const can = (perm: keyof Permissions): boolean => permsMap[rol]?.[perm] ?? false;
    const autor = user.nombre || 'Sistema';
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();

    // Restaurar de la papelera
    if (body.restaurar === true) {
      if (!can('canDelete')) {
        return NextResponse.json({ error: 'Sin permiso para restaurar proyectos' }, { status: 403 });
      }
      try {
        await prisma.proyectos.update({ where: { id }, data: { activo: true } });
      } catch (e: unknown) {
        // P2025 = el proyecto no existe → 404 en vez de 500 genérico
        if (typeof e === 'object' && e !== null && 'code' in e && (e as { code: string }).code === 'P2025') {
          return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
        }
        throw e;
      }
      const full = await buildFullProyecto(id);
      if (full) {
        await registrarActividad({
          proyectoId: id,
          cliente: full.cliente,
          usuario: autor,
          rol: rol || 'Sistema',
          accion: 'restaurar',
          detalle: `restauró la orden de proyecto de la papelera`,
        });
      }
      return NextResponse.json(full ?? { success: true });
    }

    // Permiso por sección enviada
    const requiere: Array<[boolean, keyof Permissions]> = [
      [body.cliente !== undefined || body.monto !== undefined || body.estado !== undefined, 'canEdit'],
      [body.comercial !== undefined || body.addComentario !== undefined, 'canEditComercial'],
      [body.ingenieria !== undefined || body.addObservacion !== undefined || body.updateDocumento !== undefined, 'canEditIngenieria'],
      [body.produccion !== undefined || body.etapas !== undefined, 'canEditProduccion'],
      [body.finanzas !== undefined || body.addPago !== undefined, 'canEditFinance'],
    ];
    for (const [enviado, perm] of requiere) {
      if (enviado && !can(perm)) {
        return NextResponse.json(
          { error: `Sin permiso para modificar esta sección (${perm})` },
          { status: 403 }
        );
      }
    }

    // Materiales: Logística o Comercial (import de metrado)
    if (body.materiales !== undefined && !can('canEditLogistica') && !can('canEditComercial')) {
      return NextResponse.json({ error: 'Sin permiso para modificar materiales' }, { status: 403 });
    }

    // Confirmar etapa (sign-off)
    if (body.confirmarEtapa?.etapa) {
      const etapa = body.confirmarEtapa.etapa as EtapaFlujo;
      if (!FLOW_ETAPAS.includes(etapa)) {
        return NextResponse.json({ error: 'Etapa inválida' }, { status: 400 });
      }
      if (!permsForEtapa(etapa).some((p) => can(p))) {
        return NextResponse.json({ error: `Sin permiso para firmar ${etapa}` }, { status: 403 });
      }
      // Revalidar readiness desde BD (incluye pago 100% para "completado")
      const [docs, mats, etps, confs, currentProy, com, pagos] = await Promise.all([
        prisma.proyecto_documentos.findMany({ where: { proyecto_id: id }, select: { estado: true } }),
        prisma.proyecto_materiales.findMany({ where: { proyecto_id: id }, select: { estado: true } }),
        prisma.proyecto_etapas.findMany({ where: { proyecto_id: id }, select: { estado: true } }),
        prisma.proyecto_confirmaciones.findMany({ where: { proyecto_id: id }, select: { etapa: true } }),
        prisma.proyectos.findUnique({ where: { id }, select: { cliente: true, monto: true } }),
        prisma.proyecto_comercial.findUnique({ where: { proyecto_id: id }, select: { adelanto: true } }),
        prisma.proyecto_pagos.findMany({ where: { proyecto_id: id }, select: { monto: true } }),
      ]);
      const ready = computeReadiness({
        confirmaciones: confs,
        documentos: docs,
        materiales: mats,
        etapas: etps,
        monto: currentProy?.monto,
        adelanto: com?.adelanto,
        pagos,
      });
      if (!ready[etapa]) {
        return NextResponse.json(
          { error: 'La etapa no está lista para confirmar', code: 'NOT_READY' },
          { status: 409 }
        );
      }
      await prisma.proyecto_confirmaciones.upsert({
        where: { proyecto_id_etapa: { proyecto_id: id, etapa } },
        update: { confirmada_por: autor, confirmada_at: now },
        create: { proyecto_id: id, etapa, confirmada_por: autor, confirmada_at: now },
      });
      await registrarActividad({
        proyectoId: id,
        cliente: currentProy?.cliente,
        usuario: autor,
        rol: rol || 'Sistema',
        accion: 'firma',
        detalle: `firmó y aprobó la etapa de ${etapa}`,
      });
      await notificar({
        proyectoId: id,
        tipo: 'confirmacion',
        mensaje: mensajeConfirmacion(etapa, id),
        rolesDestino: rolesParaConfirmacion(etapa),
        actorId: user.id,
        actorNombre: autor,
      });
    }

    // Deshacer etapa (cascada)
    if (body.deshacerEtapa?.etapa) {
      const etapa = body.deshacerEtapa.etapa as EtapaFlujo;
      if (!FLOW_ETAPAS.includes(etapa)) {
        return NextResponse.json({ error: 'Etapa inválida' }, { status: 400 });
      }
      if (!permsForEtapa(etapa).some((p) => can(p))) {
        return NextResponse.json({ error: `Sin permiso para deshacer ${etapa}` }, { status: 403 });
      }
      const currentProy = await prisma.proyectos.findUnique({ where: { id }, select: { cliente: true } });

      await prisma.proyecto_confirmaciones.deleteMany({
        where: { proyecto_id: id, etapa: { in: cascadeEtapas(etapa) } },
      });

      await registrarActividad({
        proyectoId: id,
        cliente: currentProy?.cliente,
        usuario: autor,
        rol: rol || 'Sistema',
        accion: 'deshacer',
        detalle: `revirtió la firma de la etapa de ${etapa}`,
      });

      await notificar({
        proyectoId: id,
        tipo: 'confirmacion',
        mensaje: `Se revirtió la etapa "${etapa}" de ${id}.`,
        rolesDestino: [rolDelAreaDeEtapa(etapa)],
        actorId: user.id,
        actorNombre: autor,
      });
    }

    // Campos principales
    if (body.cliente !== undefined || body.monto !== undefined || body.estado !== undefined) {
      const updates: Record<string, unknown> = { updated_at: now };
      if (body.cliente !== undefined) updates.cliente = body.cliente;
      if (body.monto !== undefined) updates.monto = body.monto;
      if (body.estado !== undefined) updates.estado = body.estado;
      await prisma.proyectos.update({
        where: { id },
        data: updates as Prisma.proyectosUncheckedUpdateInput,
      });
    }

    // Secciones escalares (upsert con whitelist de columnas).
    // El cast Unchecked*Input es necesario: `pick` devuelve Record<string, unknown>
    // y el whitelist ya garantiza que solo pasan columnas válidas.
    if (body.comercial) {
      const data = pick(body.comercial, COMERCIAL_KEYS);
      await prisma.proyecto_comercial.upsert({
        where: { proyecto_id: id },
        update: { ...data, updated_at: now } as Prisma.proyecto_comercialUncheckedUpdateInput,
        create: { proyecto_id: id, ...data } as Prisma.proyecto_comercialUncheckedCreateInput,
      });
    }
    if (body.ingenieria) {
      const data = pick(body.ingenieria, INGENIERIA_KEYS);
      await prisma.proyecto_ingenieria.upsert({
        where: { proyecto_id: id },
        update: { ...data, updated_at: now } as Prisma.proyecto_ingenieriaUncheckedUpdateInput,
        create: { proyecto_id: id, ...data } as Prisma.proyecto_ingenieriaUncheckedCreateInput,
      });
    }
    if (body.produccion) {
      const data = pick(body.produccion, PRODUCCION_KEYS);
      await prisma.proyecto_produccion.upsert({
        where: { proyecto_id: id },
        update: { ...data, updated_at: now } as Prisma.proyecto_produccionUncheckedUpdateInput,
        create: { proyecto_id: id, ...data } as Prisma.proyecto_produccionUncheckedCreateInput,
      });
    }
    if (body.finanzas) {
      const data = pick(body.finanzas, FINANZAS_KEYS);
      await prisma.proyecto_finanzas.upsert({
        where: { proyecto_id: id },
        update: { ...data, updated_at: now } as Prisma.proyecto_finanzasUncheckedUpdateInput,
        create: { proyecto_id: id, ...data } as Prisma.proyecto_finanzasUncheckedCreateInput,
      });
    }

    // Materiales — reemplazo total del set
    if (Array.isArray(body.materiales)) {
      await prisma.proyecto_materiales.deleteMany({ where: { proyecto_id: id } });
      if (body.materiales.length > 0) {
        await prisma.proyecto_materiales.createMany({
          data: body.materiales.map((m: Record<string, unknown>) => ({
            proyecto_id: id,
            nombre: String(m.nombre ?? ''),
            cantidad: Number(m.cantidad ?? 0),
            unidad: String(m.unidad ?? 'und'),
            comprado: Number(m.comprado ?? 0),
            estado: String(m.estado ?? 'PENDIENTE'),
            codigo: m.codigo != null ? String(m.codigo) : null,
            precio_unitario: Number(m.precio_unitario ?? 0),
          })),
        });
      }

      const currentProy = await prisma.proyectos.findUnique({ where: { id }, select: { cliente: true } });
      if (body.comercial?.metrado) {
        const totalParsed = body.materiales.reduce(
          (acc: number, m: { cantidad: number; precio_unitario?: number }) =>
            acc + m.cantidad * (m.precio_unitario || 0),
          0
        );
        await registrarActividad({
          proyectoId: id,
          cliente: currentProy?.cliente,
          usuario: autor,
          rol: rol || 'Sistema',
          accion: 'metrado',
          detalle: `importó metrado de Excel (${body.materiales.length} materiales) por un total de S/ ${totalParsed.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
        });
      } else {
        await registrarActividad({
          proyectoId: id,
          cliente: currentProy?.cliente,
          usuario: autor,
          rol: rol || 'Sistema',
          accion: 'compras',
          detalle: `actualizó el estado de compra de materiales`,
        });
      }
    }

    // Metrado importado → avisa a Logística (por flag, no por rol del actor)
    if (Array.isArray(body.materiales) && body.comercial?.metrado) {
      await notificar({
        proyectoId: id,
        tipo: 'datos',
        mensaje: `${autor} importó el metrado de ${id}. Revisen las compras.`,
        rolesDestino: ['Logística'],
        actorId: user.id,
        actorNombre: autor,
      });
    }

    // Estado de un documento (versión de plano)
    if (body.updateDocumento?.id) {
      await prisma.proyecto_documentos.updateMany({
        where: { id: body.updateDocumento.id, proyecto_id: id },
        data: { estado: body.updateDocumento.estado ?? null },
      });

      const docInfo = await prisma.proyecto_documentos.findUnique({
        where: { id: body.updateDocumento.id },
        select: { nombre: true },
      });
      const currentProy = await prisma.proyectos.findUnique({ where: { id }, select: { cliente: true } });

      await registrarActividad({
        proyectoId: id,
        cliente: currentProy?.cliente,
        usuario: autor,
        rol: rol || 'Sistema',
        accion: 'documento',
        detalle: `actualizó el estado del plano "${docInfo?.nombre || 'plano'}" a "${body.updateDocumento.estado || 'sin estado'}"`,
      });

      if (typeof body.updateDocumento.estado === 'string' && /enviad/i.test(body.updateDocumento.estado)) {
        await notificar({
          proyectoId: id,
          tipo: 'documento',
          mensaje: `Ingeniería envió un plano de ${id} para revisión.`,
          rolesDestino: ['Comercial'],
          actorId: user.id,
          actorNombre: autor,
        });
      }
    }

    // Etapas — actualización puntual por id
    if (Array.isArray(body.etapas)) {
      await Promise.all(
        body.etapas.map((e: { id: string; estado: string }) => {
          const isCompleted = e.estado === 'COMPLETADO';
          return prisma.proyecto_etapas.updateMany({
            where: { id: e.id, proyecto_id: id },
            data: {
              estado: e.estado,
              completado_por: isCompleted ? autor : null,
              completado_at: isCompleted ? now : null,
            },
          });
        })
      );

      const currentProy = await prisma.proyectos.findUnique({ where: { id }, select: { cliente: true } });
      await registrarActividad({
        proyectoId: id,
        cliente: currentProy?.cliente,
        usuario: autor,
        rol: rol || 'Sistema',
        accion: 'produccion',
        detalle: `actualizó el estado de las etapas de fabricación de producción`,
      });
    }

    // Comentario (Comercial)
    if (body.addComentario?.texto) {
      await prisma.proyecto_comentarios.create({
        data: { proyecto_id: id, autor, texto: body.addComentario.texto, fecha: today },
      });
      const currentProy = await prisma.proyectos.findUnique({ where: { id }, select: { cliente: true } });
      await registrarActividad({
        proyectoId: id,
        cliente: currentProy?.cliente,
        usuario: autor,
        rol: rol || 'Sistema',
        accion: 'comentario',
        detalle: `agregó un comentario comercial: "${body.addComentario.texto.slice(0, 60)}${body.addComentario.texto.length > 60 ? '...' : ''}"`,
      });
    }

    // Observación (Ingeniería)
    if (body.addObservacion?.texto) {
      await prisma.proyecto_observaciones.create({
        data: { proyecto_id: id, autor, texto: body.addObservacion.texto, fecha: today },
      });
      const currentProy = await prisma.proyectos.findUnique({ where: { id }, select: { cliente: true } });
      await registrarActividad({
        proyectoId: id,
        cliente: currentProy?.cliente,
        usuario: autor,
        rol: rol || 'Sistema',
        accion: 'observacion',
        detalle: `agregó una observación de ingeniería: "${body.addObservacion.texto.slice(0, 60)}${body.addObservacion.texto.length > 60 ? '...' : ''}"`,
      });
    }

    // Pago adicional (Finanzas)
    if (body.addPago?.monto !== undefined) {
      await prisma.proyecto_pagos.create({
        data: {
          proyecto_id: id,
          descripcion: body.addPago.descripcion ?? '',
          monto: body.addPago.monto,
          fecha: body.addPago.fecha ?? today,
        },
      });
      const currentProy = await prisma.proyectos.findUnique({ where: { id }, select: { cliente: true } });
      await registrarActividad({
        proyectoId: id,
        cliente: currentProy?.cliente,
        usuario: autor,
        rol: rol || 'Sistema',
        accion: 'pago',
        detalle: `registró un pago adicional de S/ ${body.addPago.monto.toLocaleString('en-US', { minimumFractionDigits: 2 })} (${body.addPago.descripcion || 'sin descripción'})`,
      });
    }

    // El estado SIEMPRE se re-deriva de las firmas
    const confsAll = await prisma.proyecto_confirmaciones.findMany({
      where: { proyecto_id: id },
      select: { etapa: true },
    });
    const confirmadasAll = new Set(confsAll.map((c) => c.etapa as EtapaFlujo));
    const nuevoEstado = computeEstadoFromConfirmaciones(confirmadasAll);
    await prisma.proyectos.update({ where: { id }, data: { estado: nuevoEstado, updated_at: now } });

    const full = await buildFullProyecto(id);
    return NextResponse.json(full ?? { success: true, estado: nuevoEstado });
  } catch (err) {
    console.error('PATCH /api/proyectos/[id] error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const rol = user.rol as Rol;
    const permsMap = await getRolePermissionsServer();
    if (!permsMap[rol]?.canDelete) {
      return NextResponse.json({ error: 'Sin permiso para eliminar proyectos' }, { status: 403 });
    }

    const proy = await prisma.proyectos.findUnique({ where: { id }, select: { cliente: true } });
    if (!proy) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });

    // Borrado suave (papelera)
    await prisma.proyectos.update({ where: { id }, data: { activo: false } });

    await registrarActividad({
      proyectoId: id,
      cliente: proy.cliente,
      usuario: user.nombre || 'Sistema',
      rol: rol || 'Sistema',
      accion: 'eliminacion',
      detalle: `envió la orden de proyecto a la papelera`,
    });

    await notificar({
      proyectoId: id,
      tipo: 'hito',
      mensaje: `${user.nombre ?? 'Alguien'} (${rol}) eliminó la PR ${id}${proy.cliente ? ` — ${proy.cliente}` : ''}.`,
      rolesDestino: ['Administrador', 'Gerencia General'],
      actorId: user.id,
      actorNombre: user.nombre,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/proyectos/[id] error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
