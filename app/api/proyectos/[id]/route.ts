import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { PERMS } from '@/lib/auth/permissions';
import {
  aplicarRetraso,
  computeEstadoFromConfirmaciones,
  computeReadiness,
  cascadeEtapas,
  permForEtapa,
  FLOW_ETAPAS,
  type EtapaFlujo,
} from '@/lib/utils/estado-proyecto';
import { notificar, rolesParaConfirmacion, mensajeConfirmacion, rolDelAreaDeEtapa } from '@/lib/notificaciones';
import type { Permissions, Rol } from '@/types';

// Construye el proyecto completo (todas las áreas) en consultas paralelas.
// Se reusa en el GET y al final del PATCH, así una acción se resuelve en UN solo
// viaje (no hace falta un GET extra después de cada cambio).
async function buildFullProyecto(supabase: Awaited<ReturnType<typeof createClient>>, id: string) {
  const { data: proyecto, error } = await supabase
    .from('proyectos').select('*').eq('id', id).single();
  if (error || !proyecto) return null;

  const [comercial, ingenieria, materiales, produccion, etapas, finanzas, pagos, comentarios, observaciones, documentos, confirmaciones] = await Promise.all([
    supabase.from('proyecto_comercial').select('*').eq('proyecto_id', id).maybeSingle(),
    supabase.from('proyecto_ingenieria').select('*').eq('proyecto_id', id).maybeSingle(),
    supabase.from('proyecto_materiales').select('*').eq('proyecto_id', id).order('id'),
    supabase.from('proyecto_produccion').select('*').eq('proyecto_id', id).maybeSingle(),
    supabase.from('proyecto_etapas').select('*').eq('proyecto_id', id).order('orden'),
    supabase.from('proyecto_finanzas').select('*').eq('proyecto_id', id).maybeSingle(),
    supabase.from('proyecto_pagos').select('*').eq('proyecto_id', id).order('fecha'),
    supabase.from('proyecto_comentarios').select('*').eq('proyecto_id', id).order('fecha', { ascending: false }),
    supabase.from('proyecto_observaciones').select('*').eq('proyecto_id', id).order('fecha', { ascending: false }),
    supabase.from('proyecto_documentos').select('*').eq('proyecto_id', id).order('created_at', { ascending: false }),
    supabase.from('proyecto_confirmaciones').select('*').eq('proyecto_id', id),
  ]);

  const fullProyecto = {
    ...proyecto,
    comercial: comercial.data ? { ...comercial.data, comentarios: comentarios.data || [] } : null,
    ingenieria: ingenieria.data ? { ...ingenieria.data, observaciones: observaciones.data || [] } : null,
    logistica: { materiales: materiales.data || [] },
    produccion: produccion.data ? { ...produccion.data, etapas: etapas.data || [] } : null,
    finanzas: finanzas.data ? { ...finanzas.data, pagos: pagos.data || [] } : null,
    documentos: documentos.data || [],
    confirmaciones: confirmaciones.data || [],
  };

  const hoy = new Date().toISOString().split('T')[0];
  const confirmadas = new Set((confirmaciones.data ?? []).map((c) => c.etapa as EtapaFlujo));
  const estadoBase = computeEstadoFromConfirmaciones(confirmadas);
  fullProyecto.estado = aplicarRetraso(estadoBase, comercial.data?.fecha_entrega, hoy);
  return fullProyecto;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const full = await buildFullProyecto(supabase, id);
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
    const supabase = await createClient();
    const body = await request.json();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    // Cargar rol del usuario para autorización server-side (fuente de verdad)
    const { data: userData } = await supabase
      .from('users')
      .select('nombre, rol')
      .eq('id', user.id)
      .single();

    const rol = userData?.rol as Rol | undefined;
    const can = (perm: keyof Permissions): boolean =>
      rol ? PERMS[rol]?.[perm] ?? false : false;
    const autor = userData?.nombre || 'Sistema';
    const today = new Date().toISOString().split('T')[0];
    const now = new Date().toISOString();

    // Validar que cada sección enviada cuente con su permiso antes de escribir
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

    // Materiales: Logística los gestiona, pero Comercial también puede escribirlos
    // al importar el metrado (el metrado define la lista inicial de materiales).
    if (body.materiales !== undefined && !can('canEditLogistica') && !can('canEditComercial')) {
      return NextResponse.json(
        { error: 'Sin permiso para modificar materiales' },
        { status: 403 }
      );
    }

    // Confirmar una etapa del flujo (sign-off)
    if (body.confirmarEtapa?.etapa) {
      const etapa = body.confirmarEtapa.etapa as EtapaFlujo;
      if (!FLOW_ETAPAS.includes(etapa)) {
        return NextResponse.json({ error: 'Etapa inválida' }, { status: 400 });
      }
      if (!can(permForEtapa(etapa))) {
        return NextResponse.json({ error: `Sin permiso para firmar ${etapa}` }, { status: 403 });
      }
      // Revalidar readiness desde la BD (no confiar en el cliente)
      const [docsR, matsR, etpsR, confsR] = await Promise.all([
        supabase.from('proyecto_documentos').select('estado').eq('proyecto_id', id),
        supabase.from('proyecto_materiales').select('estado').eq('proyecto_id', id),
        supabase.from('proyecto_etapas').select('estado').eq('proyecto_id', id),
        supabase.from('proyecto_confirmaciones').select('etapa').eq('proyecto_id', id),
      ]);
      const ready = computeReadiness({
        confirmaciones: confsR.data ?? [],
        documentos: docsR.data ?? [],
        materiales: matsR.data ?? [],
        etapas: etpsR.data ?? [],
      });
      if (!ready[etapa]) {
        return NextResponse.json(
          { error: 'La etapa no está lista para confirmar', code: 'NOT_READY' },
          { status: 409 }
        );
      }
      await supabase.from('proyecto_confirmaciones').upsert(
        { proyecto_id: id, etapa, confirmada_por: autor, confirmada_at: now },
        { onConflict: 'proyecto_id,etapa' }
      );
      await notificar({
        proyectoId: id,
        tipo: 'confirmacion',
        mensaje: mensajeConfirmacion(etapa, id),
        rolesDestino: rolesParaConfirmacion(etapa),
        actorId: user.id,
        actorNombre: autor,
      });
    }

    // Deshacer una etapa (y las posteriores, en cascada)
    if (body.deshacerEtapa?.etapa) {
      const etapa = body.deshacerEtapa.etapa as EtapaFlujo;
      if (!FLOW_ETAPAS.includes(etapa)) {
        return NextResponse.json({ error: 'Etapa inválida' }, { status: 400 });
      }
      if (!can(permForEtapa(etapa))) {
        return NextResponse.json({ error: `Sin permiso para deshacer ${etapa}` }, { status: 403 });
      }
      await supabase
        .from('proyecto_confirmaciones')
        .delete()
        .eq('proyecto_id', id)
        .in('etapa', cascadeEtapas(etapa));
      await notificar({
        proyectoId: id,
        tipo: 'confirmacion',
        mensaje: `Se revirtió la etapa "${etapa}" de ${id}.`,
        rolesDestino: [rolDelAreaDeEtapa(etapa)],
        actorId: user.id,
        actorNombre: autor,
      });
    }

    // Campos principales del proyecto
    if (body.cliente !== undefined || body.monto !== undefined || body.estado !== undefined) {
      const updates: Record<string, unknown> = { updated_at: now };
      if (body.cliente !== undefined) updates.cliente = body.cliente;
      if (body.monto !== undefined) updates.monto = body.monto;
      if (body.estado !== undefined) updates.estado = body.estado;
      await supabase.from('proyectos').update(updates).eq('id', id);
    }

    // Comercial (escalares)
    if (body.comercial) {
      await supabase
        .from('proyecto_comercial')
        .upsert({ proyecto_id: id, ...body.comercial, updated_at: now }, { onConflict: 'proyecto_id' });
    }

    // Ingeniería (escalares)
    if (body.ingenieria) {
      await supabase
        .from('proyecto_ingenieria')
        .upsert({ proyecto_id: id, ...body.ingenieria, updated_at: now }, { onConflict: 'proyecto_id' });
    }

    // Producción (escalares)
    if (body.produccion) {
      await supabase
        .from('proyecto_produccion')
        .upsert({ proyecto_id: id, ...body.produccion, updated_at: now }, { onConflict: 'proyecto_id' });
    }

    // Finanzas (escalares)
    if (body.finanzas) {
      await supabase
        .from('proyecto_finanzas')
        .upsert({ proyecto_id: id, ...body.finanzas, updated_at: now }, { onConflict: 'proyecto_id' });
    }

    // Materiales — estrategia de reemplazo total del set
    if (Array.isArray(body.materiales)) {
      await supabase.from('proyecto_materiales').delete().eq('proyecto_id', id);
      if (body.materiales.length > 0) {
        await supabase.from('proyecto_materiales').insert(
          body.materiales.map((m: Record<string, unknown>) => ({
            proyecto_id: id,
            nombre: m.nombre,
            cantidad: m.cantidad ?? 0,
            unidad: m.unidad ?? 'und',
            comprado: m.comprado ?? 0,
            estado: m.estado ?? 'PENDIENTE',
            codigo: m.codigo ?? null,
            precio_unitario: m.precio_unitario ?? 0,
          }))
        );
      }
    }

    // Metrado importado: si quien manda materiales es Comercial, avisa a Logística.
    if (Array.isArray(body.materiales) && rol === 'Comercial') {
      await notificar({
        proyectoId: id,
        tipo: 'datos',
        mensaje: `Comercial importó el metrado de ${id}. Revisen las compras.`,
        rolesDestino: ['Logística'],
        actorId: user.id,
        actorNombre: autor,
      });
    }

    // Estado de un documento (versión de plano)
    if (body.updateDocumento?.id) {
      await supabase
        .from('proyecto_documentos')
        .update({ estado: body.updateDocumento.estado ?? null })
        .eq('id', body.updateDocumento.id)
        .eq('proyecto_id', id);
      // Plano "Enviados a comercial" → avisa a Comercial para que revise.
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

    // Etapas — actualización puntual de estado por id
    if (Array.isArray(body.etapas)) {
      await Promise.all(
        body.etapas.map((e: { id: string; estado: string }) =>
          supabase.from('proyecto_etapas').update({ estado: e.estado }).eq('id', e.id)
        )
      );
    }

    // Nuevo comentario (Comercial)
    if (body.addComentario?.texto) {
      await supabase.from('proyecto_comentarios').insert({
        proyecto_id: id,
        autor,
        texto: body.addComentario.texto,
        fecha: today,
      });
    }

    // Nueva observación (Ingeniería)
    if (body.addObservacion?.texto) {
      await supabase.from('proyecto_observaciones').insert({
        proyecto_id: id,
        autor,
        texto: body.addObservacion.texto,
        fecha: today,
      });
    }

    // Nuevo pago adicional (Finanzas)
    if (body.addPago?.monto !== undefined) {
      await supabase.from('proyecto_pagos').insert({
        proyecto_id: id,
        descripcion: body.addPago.descripcion ?? '',
        monto: body.addPago.monto,
        fecha: body.addPago.fecha ?? today,
      });
    }

    // Estado manual: se deriva de las firmas de etapa (no de los datos crudos).
    const { data: confsAll } = await supabase
      .from('proyecto_confirmaciones')
      .select('etapa')
      .eq('proyecto_id', id);
    const confirmadasAll = new Set((confsAll ?? []).map((c) => c.etapa as EtapaFlujo));
    const nuevoEstado = computeEstadoFromConfirmaciones(confirmadasAll);
    await supabase.from('proyectos').update({ estado: nuevoEstado, updated_at: now }).eq('id', id);

    // Devolver el proyecto YA actualizado (un solo viaje: el cliente no necesita un GET extra).
    const full = await buildFullProyecto(supabase, id);
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
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    // Solo roles con permiso de borrado (Administrador, Comercial, Ingeniería)
    const { data: userData } = await supabase
      .from('users')
      .select('nombre, rol')
      .eq('id', user.id)
      .single();

    const rol = userData?.rol as Rol | undefined;
    if (!rol || !PERMS[rol]?.canDelete) {
      return NextResponse.json({ error: 'Sin permiso para eliminar proyectos' }, { status: 403 });
    }

    // Capturamos el cliente antes de borrar (para el mensaje de la notificación)
    const { data: proy } = await supabase
      .from('proyectos').select('cliente').eq('id', id).maybeSingle();

    const { error } = await supabase.from('proyectos').delete().eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Avisar a Administración y Gerencia que se eliminó una PR (trazabilidad)
    await notificar({
      proyectoId: id,
      tipo: 'hito',
      mensaje: `${userData?.nombre ?? 'Alguien'} (${rol}) eliminó la PR ${id}${proy?.cliente ? ` — ${proy.cliente}` : ''}.`,
      rolesDestino: ['Administrador', 'Gerencia General'],
      actorId: user.id,
      actorNombre: userData?.nombre,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/proyectos/[id] error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
