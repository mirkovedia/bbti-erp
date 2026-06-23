import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getRolePermissionsServer } from '@/lib/auth/permissions';
import type { Rol } from '@/types';

// Acciones de alto valor (avance real del trabajo), separadas de la rutina.
// Lo que importa es el AVANCE, no la cantidad de clicks.
const HITO_ACCIONES = new Set([
  'creacion',
  'firma',
  'metrado',
  'compras',
  'produccion',
  'documento_subida',
]);

interface FilaUsuario {
  nombre: string;
  rol: string | null;
  activo: boolean;
  total: number;
  hitos: number;
  rutina: number;
  proyectos: number;
  ultimaActividad: string | null;
  porAccion: Record<string, number>;
}

export async function GET(req: NextRequest) {
  try {
    // Auth con la sesión del navegador.
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    // El resto se lee con service role (bypassa RLS), patrón del backend.
    const admin = createAdminClient();

    // Verificar permiso canViewReports (respeta permisos dinámicos por rol).
    const { data: me } = await admin.from('users').select('rol').eq('id', user.id).maybeSingle();
    const perms = await getRolePermissionsServer(admin);
    const rolActual = me?.rol as Rol | undefined;
    if (!rolActual || !perms[rolActual]?.canViewReports) {
      return NextResponse.json({ error: 'Acceso restringido' }, { status: 403 });
    }

    // Rango de fechas (Lima, UTC-5). Default: últimos 7 días.
    const hoyLima = new Date(Date.now() - 5 * 3_600_000).toISOString().split('T')[0];
    const sp = req.nextUrl.searchParams;
    const hasta = sp.get('hasta') || hoyLima;
    const desde =
      sp.get('desde') ||
      new Date(Date.parse(`${hasta}T00:00:00Z`) - 6 * 86_400_000).toISOString().split('T')[0];

    // Usuarios activos (base: los que no registraron nada igual deben aparecer).
    const { data: usuarios } = await admin
      .from('users')
      .select('nombre, rol, activo')
      .order('nombre');

    // Actividad dentro del rango [desde 00:00, hasta 23:59:59] hora Lima.
    const { data: eventos } = await admin
      .from('actividad_log')
      .select('usuario, rol, accion, proyecto_id, created_at')
      .gte('created_at', `${desde}T00:00:00-05:00`)
      .lte('created_at', `${hasta}T23:59:59-05:00`)
      .order('created_at', { ascending: false });

    // Inicializar una fila por usuario activo.
    const filas = new Map<string, FilaUsuario>();
    const proyectosPorUsuario = new Map<string, Set<string>>();
    for (const u of usuarios ?? []) {
      if (u.activo === false) continue;
      filas.set(u.nombre, {
        nombre: u.nombre,
        rol: u.rol ?? null,
        activo: u.activo !== false,
        total: 0,
        hitos: 0,
        rutina: 0,
        proyectos: 0,
        ultimaActividad: null,
        porAccion: {},
      });
      proyectosPorUsuario.set(u.nombre, new Set());
    }

    // Acumular eventos. Un evento de un usuario que ya no está activo igual se
    // cuenta (creamos su fila marcada como inactiva) para no perder historial.
    for (const e of eventos ?? []) {
      let fila = filas.get(e.usuario);
      if (!fila) {
        fila = {
          nombre: e.usuario,
          rol: e.rol ?? null,
          activo: false,
          total: 0,
          hitos: 0,
          rutina: 0,
          proyectos: 0,
          ultimaActividad: null,
          porAccion: {},
        };
        filas.set(e.usuario, fila);
        proyectosPorUsuario.set(e.usuario, new Set());
      }
      fila.total++;
      if (HITO_ACCIONES.has(e.accion)) fila.hitos++;
      else fila.rutina++;
      fila.porAccion[e.accion] = (fila.porAccion[e.accion] ?? 0) + 1;
      if (e.proyecto_id) proyectosPorUsuario.get(e.usuario)?.add(e.proyecto_id);
      // ultimaActividad: como los eventos vienen DESC, el primero visto es el más reciente.
      if (!fila.ultimaActividad) fila.ultimaActividad = e.created_at;
    }

    for (const [nombre, set] of proyectosPorUsuario) {
      const fila = filas.get(nombre);
      if (fila) fila.proyectos = set.size;
    }

    const filasArr = [...filas.values()].sort((a, b) => b.total - a.total);
    const totales = {
      acciones: filasArr.reduce((s, f) => s + f.total, 0),
      hitos: filasArr.reduce((s, f) => s + f.hitos, 0),
      conActividad: filasArr.filter((f) => f.total > 0).length,
      sinActividad: filasArr.filter((f) => f.total === 0).length,
    };

    return NextResponse.json({ desde, hasta, usuarios: filasArr, totales });
  } catch (err) {
    console.error('GET /api/productividad error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
