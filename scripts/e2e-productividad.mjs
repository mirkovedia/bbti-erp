// Integración: el panel de productividad agrega actividad por persona, separa
// hitos de rutina, y muestra a los usuarios SIN actividad (el dato clave).
import { getAuthCookie, serviceClient } from './lib/supabase-test.mjs';

const BASE = process.env.BASE || 'http://localhost:3000';
const svc = serviceClient();
let pass = 0, fail = 0;
const check = (c, m) => { console.log((c ? '✅ ' : '❌ ') + m); c ? pass++ : fail++; };

const hoy = new Date(Date.now() - 5 * 3_600_000).toISOString().split('T')[0];

// Usuario real activo para sembrar actividad (Ingeniería).
const { data: ing } = await svc
  .from('users').select('nombre').eq('rol', 'Ingeniería').eq('activo', true).limit(1).maybeSingle();
const NOMBRE = ing?.nombre;

// Sembrar: 1 hito (firma) + 1 rutina (comentario) hoy para ese usuario.
const tag = `PROBE-PROD-${Date.now()}`;
await svc.from('actividad_log').insert([
  { proyecto_id: tag, cliente: 'PROBE', usuario: NOMBRE, rol: 'Ingeniería', accion: 'firma', detalle: 'firmó etapa (probe)' },
  { proyecto_id: tag, cliente: 'PROBE', usuario: NOMBRE, rol: 'Ingeniería', accion: 'comentario', detalle: 'comentó (probe)' },
]);

// 0) sin permiso (Logística no tiene canViewReports) → 403
const cookieLog = await getAuthCookie('logistica@bbti.com.pe', 'carlosr');
const r403 = await fetch(`${BASE}/api/productividad`, { headers: { cookie: cookieLog } });
check(r403.status === 403, `Logística (sin canViewReports) → 403 (${r403.status})`);

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
await svc.from('actividad_log').delete().eq('proyecto_id', tag);
console.log(`\n===== ${pass} OK / ${fail} fallos =====`);
process.exit(fail ? 1 : 0);
