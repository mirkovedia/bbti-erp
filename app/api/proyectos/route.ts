import { createClient } from '@/lib/supabase/server';
import { PERMS } from '@/lib/auth/permissions';
import { aplicarRetraso } from '@/lib/utils/estado-proyecto';
import type { Rol } from '@/types';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const supabase = await createClient();

    const { data: proyectos, error } = await supabase
      .from('proyectos')
      .select(`
        *,
        proyecto_comercial (fecha_entrega, dias_plazo, adelanto, adelanto_fijado, metrado, alerta),
        proyecto_produccion (progreso)
      `)
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
      return {
        ...p,
        estado: aplicarRetraso(p.estado, comercial?.fecha_entrega, hoy),
        comercial,
        produccion,
        proyecto_comercial: undefined,
        proyecto_produccion: undefined,
      };
    });

    return NextResponse.json(formatted);
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

    // Generar ID tipo PR-01-2024 a partir del máximo correlativo del año
    // (evita colisiones tras borrados; count+1 reutilizaría IDs ya existentes)
    const year = new Date().getFullYear();
    const { data: delAnio } = await supabase
      .from('proyectos')
      .select('id')
      .like('id', `PR-%-${year}`);

    const maxCorrelativo = (delAnio || []).reduce((max, p) => {
      const n = parseInt(p.id.split('-')[1], 10);
      return Number.isFinite(n) && n > max ? n : max;
    }, 0);

    const nextNum = String(maxCorrelativo + 1).padStart(2, '0');
    const id = `PR-${nextNum}-${year}`;

    // Get user data for denormalized name + verificación de permiso
    const { data: userData } = await supabase
      .from('users')
      .select('nombre, rol')
      .eq('id', user.id)
      .single();

    const rol = userData?.rol as Rol | undefined;
    if (!rol || !PERMS[rol]?.canCreate) {
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

    // Create default production stages
    const etapasDefault = [
      'Habilitado de material',
      'Armado de estructura',
      'Montaje de equipos',
      'Cableado',
      'Acabados',
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

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error('POST /api/proyectos error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
