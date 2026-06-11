import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const { data: solicitante } = await supabase
      .from('users')
      .select('rol')
      .eq('id', authUser.id)
      .single();

    if (solicitante?.rol !== 'Administrador') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    // Tablas a respaldar
    const tables = [
      'company_config',
      'users',
      'proyectos',
      'role_permissions',
      'proyecto_comercial',
      'proyecto_ingenieria',
      'proyecto_materiales',
      'proyecto_produccion',
      'proyecto_etapas',
      'proyecto_finanzas',
      'proyecto_pagos',
      'proyecto_comentarios',
      'proyecto_observaciones',
      'proyecto_documentos',
      'proyecto_confirmaciones',
      'alertas'
    ];

    const backupData: Record<string, any> = {};

    // Consultas en paralelo para rapidez
    const queries = tables.map(async (table) => {
      const { data, error } = await supabase.from(table).select('*');
      if (error) throw new Error(`Error al leer tabla ${table}: ${error.message}`);
      backupData[table] = data ?? [];
    });

    await Promise.all(queries);

    return NextResponse.json({
      version: '1.0',
      exportedAt: new Date().toISOString(),
      exportedBy: authUser.email,
      data: backupData
    });

  } catch (err: any) {
    console.error('GET /api/configuracion/backup error:', err);
    return NextResponse.json({ error: err.message || 'Error interno del servidor' }, { status: 500 });
  }
}
