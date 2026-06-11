import { createClient } from '@/lib/supabase/server';
import { getRolePermissionsServer } from '@/lib/auth/permissions';
import { aplicarRetraso, computeEstadoFromConfirmaciones, type EtapaFlujo } from '@/lib/utils/estado-proyecto';
import { notificar } from '@/lib/notificaciones';
import { registrarActividad } from '@/lib/utils/actividad';
import type { Rol } from '@/types';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    // ?papelera=1 → solo PRs en la papelera (inactivas); por defecto solo activas.
    const verPapelera = new URL(request.url).searchParams.get('papelera') === '1';

    const { data: proyectos, error } = await supabase
      .from('proyectos')
      .select(`
        *,
        proyecto_comercial (fecha_entrega, dias_plazo, adelanto, adelanto_fijado, metrado, alerta),
        proyecto_produccion (progreso),
        proyecto_confirmaciones (etapa, confirmada_por, confirmada_at)
      `)
      .eq('activo', !verPapelera)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // El embed de Supabase devuelve un OBJETO (no array) cuando la FK es única
    // (proyecto_comercial/produccion tienen proyecto_id único). Normalizamos ambos casos.
    const one = (v: unknown) => (Array.isArray(v) ? v[0] ?? null : v ?? null);

    const hoy = new Date().toISOString().split('T')[0];
    const formatted = proyectos.map((p) => {
      const comercial = one(p.proyecto_comercial);
      const produccion = one(p.proyecto_produccion);
      const confirmaciones = Array.isArray(p.proyecto_confirmaciones) ? p.proyecto_confirmaciones : [];
      const confirmadas = new Set<EtapaFlujo>(confirmaciones.map((c: { etapa: string }) => c.etapa as EtapaFlujo));
      const estadoBase = computeEstadoFromConfirmaciones(confirmadas);
      return {
        ...p,
        estado: aplicarRetraso(estadoBase, comercial?.fecha_entrega, hoy),
        comercial,
        produccion,
        confirmaciones,
        proyecto_comercial: undefined,
        proyecto_produccion: undefined,
        proyecto_confirmaciones: undefined,
      };
    });

    // Filtro defensivo en JS: funciona aunque la columna `activo` aún no exista
    // (si es undefined se trata como activa). Inactiva solo cuando activo === false.
    const visibles = formatted.filter((p) =>
      verPapelera ? p.activo === false : p.activo !== false
    );

    return NextResponse.json(visibles);
  } catch (err) {
    console.error('GET /api/proyectos error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const body = await request.json();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    // Generar ID tipo PREFIX-01-2024 a partir del máximo correlativo del año
    // (evita colisiones tras borrados; count+1 reutilizaría IDs ya existentes)
    const { data: configData } = await supabase
      .from('company_config')
      .select('orden_prefix')
      .limit(1)
      .maybeSingle();
    const prefix = configData?.orden_prefix || 'PR';

    const year = new Date().getFullYear();
    const { data: delAnio } = await supabase
      .from('proyectos')
      .select('id')
      .like('id', `${prefix}-%-${year}`);

    const maxCorrelativo = (delAnio || []).reduce((max, p) => {
      const parts = p.id.split('-');
      if (parts.length >= 3 && parts[0] === prefix) {
        const n = parseInt(parts[1], 10);
        return Number.isFinite(n) && n > max ? n : max;
      }
      return max;
    }, 0);

    const nextNum = String(maxCorrelativo + 1).padStart(2, '0');
    const id = `${prefix}-${nextNum}-${year}`;

    // Get user data for denormalized name + verificación de permiso
    const { data: userData } = await supabase
      .from('users')
      .select('nombre, rol')
      .eq('id', user.id)
      .single();

    const rol = userData?.rol as Rol | undefined;
    const permsMap = await getRolePermissionsServer(supabase);
    if (!rol || !permsMap[rol]?.canCreate) {
      return NextResponse.json({ error: 'No tienes permiso para crear proyectos' }, { status: 403 });
    }

    const proyecto = {
      id,
      cliente: body.cliente,
      fecha_creacion: new Date().toISOString().split('T')[0],
      monto: body.monto || 0,
      usuario_id: user.id,
      usuario_nombre: userData?.nombre || 'Sistema',
      // El estado es automático (se deriva del avance). Un proyecto nuevo arranca en Ingeniería.
      estado: 'EN INGENIERÍA',
    };

    const { data, error } = await supabase
      .from('proyectos')
      .insert(proyecto)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Registrar en la bitácora general de Command Center
    await registrarActividad({
      proyectoId: id,
      cliente: body.cliente,
      usuario: userData?.nombre || 'Sistema',
      rol: rol || 'Sistema',
      accion: 'creacion',
      detalle: `creó la orden de proyecto para el cliente ${body.cliente}`,
    });

    // Create related records
    if (body.fecha_entrega || body.dias_plazo || body.adelanto) {
      await supabase.from('proyecto_comercial').insert({
        proyecto_id: id,
        fecha_entrega: body.fecha_entrega || null,
        dias_plazo: body.dias_plazo || null,
        adelanto: body.adelanto || 0,
        metrado: body.metrado || '',
      });
    }

    // Create default production stages (flujo de fabricación de tableros)
    const etapasDefault = [
      'Habilitación de material',
      'Área de Corte',
      'Área de Doblez',
      'Área de Soldadura',
      'Área de Pintura',
      'Área de Electricidad',
      'Área de Ensamblaje',
    ];

    await supabase.from('proyecto_etapas').insert(
      etapasDefault.map((nombre, i) => ({
        proyecto_id: id,
        nombre,
        orden: i + 1,
        estado: 'PENDIENTE',
      }))
    );

    // Create ingenieria record
    await supabase.from('proyecto_ingenieria').insert({
      proyecto_id: id,
      estado_planos: 'Solicitud de planos',
    });

    // Create produccion record
    await supabase.from('proyecto_produccion').insert({
      proyecto_id: id,
      progreso: 0,
      pruebas: false,
      envio: false,
    });

    // Create finanzas record
    await supabase.from('proyecto_finanzas').insert({
      proyecto_id: id,
      adelanto: body.adelanto || 0,
      porcentaje: 0,
    });

    await notificar({
      proyectoId: id,
      tipo: 'hito',
      mensaje: `Nuevo proyecto ${id} (${body.cliente}) creado. Inicien los planos.`,
      rolesDestino: ['Ingeniería'],
      actorId: user.id,
      actorNombre: userData?.nombre,
    });

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error('POST /api/proyectos error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
