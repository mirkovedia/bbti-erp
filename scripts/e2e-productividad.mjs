// Integración: el panel de productividad agrega actividad por persona, separa
// hitos de rutina, y muestra a los usuarios SIN actividad (el dato clave).
import { getAuthCookie, db, BASE_URL } from './lib/test-helpers.mjs';

const BASE = BASE_URL;
let pass = 0, fail = 0;
const check = (c, m) => { console.log((c ? '✅ ' : '❌ ') + m); c ? pass++ : fail++; };

const hoy = new Date(Date.now() - 5 * 3_600_000).toISOString().split('T')[0];

async function main() {
  try {
    // Usuario real activo para sembrar actividad (Ingeniería).
    const ing = await db.users.findFirst({
      where: { rol: 'Ingeniería', activo: true },
      select: { nombre: true }
    });
    const NOMBRE = ing?.nombre;

    // Sembrar: 1 hito (firma) + 1 rutina (comentario) hoy para ese usuario.
    const tag = `PROBE-PROD-${Date.now()}`;
    await db.actividad_log.createMany({
      data: [
        { proyecto_id: tag, cliente: 'PROBE', usuario: NOMBRE, rol: 'Ingeniería', accion: 'firma', detalle: 'firmó etapa (probe)' },
        { proyecto_id: tag, cliente: 'PROBE', usuario: NOMBRE, rol: 'Ingeniería', accion: 'comentario', detalle: 'comentó (probe)' },
      ]
    });

    // 0) sin permiso → 403.
    const CANDIDATOS_403 = [
      { email: 'ingenieria@bbti.com.pe', pass: 'goscco', rol: 'Ingeniería' },
      { email: 'produccion@bbti.com.pe', pass: 'anat', rol: 'Producción' },
      { email: 'logistica@bbti.com.pe', pass: 'carlosr', rol: 'Logística' },
    ];
    const permRows = await db.role_permissions.findMany({ select: { rol: true, permissions: true } });
    const permsDe = (rol) => permRows?.find((r) => r.rol === rol)?.permissions ?? {};
    const sinReporte = CANDIDATOS_403.find((c) => !permsDe(c.rol).canViewReports);
    if (sinReporte) {
      const cookieSin = await getAuthCookie(sinReporte.email, sinReporte.pass);
      const r403 = await fetch(`${BASE}/api/productividad?desde=${hoy}&hasta=${hoy}`, { headers: { cookie: cookieSin } });
      check(r403.status === 403, `${sinReporte.rol} (sin canViewReports) → 403 (${r403.status})`);
    } else {
      console.log('⚠ todos los roles candidatos tienen canViewReports — test 403 omitido');
    }

    // 1) admin (canViewReports) → 200 + estructura
    const cookie = await getAuthCookie('admin@bbti.com.pe', 'admin2024');
    const res = await fetch(`${BASE}/api/productividad?desde=${hoy}&hasta=${hoy}`, { headers: { cookie } });
    const j = await res.json();
    check(res.status === 200, `admin → 200 (${res.status})`);
    check(Array.isArray(j.usuarios), 'devuelve arreglo de usuarios');

    // 2) el usuario sembrado tiene 1 hito + 1 rutina = total 2
    const fila = (j.usuarios || []).find((u) => u.nombre === NOMBRE);
    check(!!fila, `aparece ${NOMBRE} en el reporte`);
    check(fila?.hitos === 1, `hitos = 1 (${fila?.hitos})`);
    check(fila?.rutina === 1, `rutina = 1 (${fila?.rutina})`);
    check(fila?.total === 2, `total = 2 (${fila?.total})`);
    check(fila?.ultimaActividad != null, 'última actividad presente');

    // 3) usuarios SIN actividad aparecen con total 0 y "sin movimientos"
    const sinAct = (j.usuarios || []).filter((u) => u.total === 0);
    check(sinAct.length >= 1, `hay usuarios sin actividad listados (${sinAct.length})`);
    check(sinAct.every((u) => u.ultimaActividad === null), 'sin actividad → ultimaActividad null');

    // 4) totales coherentes
    check(j.totales?.hitos >= 1, `totales.hitos >= 1 (${j.totales?.hitos})`);

    // limpieza
    await db.actividad_log.deleteMany({ where: { proyecto_id: tag } });
    console.log(`\n===== ${pass} OK / ${fail} fallos =====`);
  } catch (err) {
    console.error('Error durante la ejecución del test:', err);
    fail++;
  } finally {
    await db.$disconnect();
    process.exit(fail ? 1 : 0);
  }
}

main();
