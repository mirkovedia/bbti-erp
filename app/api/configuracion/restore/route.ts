import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
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

    const { version, data } = await request.json();
    if (!version || !data) {
      return NextResponse.json({ error: 'Formato de backup inválido o vacío' }, { status: 400 });
    }

    // 1. Restaurar configuración de empresa
    if (Array.isArray(data.company_config) && data.company_config.length > 0) {
      // Eliminar configuración actual para evitar duplicados si cambian IDs
      await supabase.from('company_config').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      const { error } = await supabase.from('company_config').insert(data.company_config);
      if (error) throw new Error(`Restauración company_config falló: ${error.message}`);
    }

    // 2. Restaurar permisos de roles
    if (Array.isArray(data.role_permissions) && data.role_permissions.length > 0) {
      const { error } = await supabase.from('role_permissions').upsert(data.role_permissions);
      if (error) throw new Error(`Restauración role_permissions falló: ${error.message}`);
    }

    // 3. Restaurar perfiles de usuarios (upsert para no romper referencias con auth.users de Supabase)
    if (Array.isArray(data.users) && data.users.length > 0) {
      const { error } = await supabase.from('users').upsert(data.users);
      if (error) throw new Error(`Restauración users falló: ${error.message}`);
    }

    // 4. Eliminar todos los proyectos (esto eliminará automáticamente todas las subtablas en cascada)
    console.log('Eliminando proyectos existentes para restauración...');
    const { error: deleteError } = await supabase.from('proyectos').delete().neq('id', 'NONE');
    if (deleteError) throw new Error(`Fallo al limpiar base de datos de proyectos: ${deleteError.message}`);

    // 5. Insertar proyectos base
    if (Array.isArray(data.proyectos) && data.proyectos.length > 0) {
      const { error } = await supabase.from('proyectos').insert(data.proyectos);
      if (error) throw new Error(`Restauración proyectos base falló: ${error.message}`);
    }

    // 6. Insertar subtablas relacionadas en orden
    const subtables = [
      'proyecto_comercial',
      'proyecto_ingenieria',
      'proyecto_produccion',
      'proyecto_finanzas',
      'proyecto_materiales',
      'proyecto_etapas',
      'proyecto_pagos',
      'proyecto_comentarios',
      'proyecto_observaciones',
      'proyecto_documentos',
      'proyecto_confirmaciones',
      'alertas'
    ];

    for (const table of subtables) {
      const list = data[table];
      if (Array.isArray(list) && list.length > 0) {
        const { error } = await supabase.from(table).insert(list);
        if (error) throw new Error(`Restauración tabla ${table} falló: ${error.message}`);
      }
    }

    return NextResponse.json({ success: true });

  } catch (err: any) {
    console.error('POST /api/configuracion/restore error:', err);
    return NextResponse.json({ error: err.message || 'Error durante la restauración' }, { status: 500 });
  }
}
