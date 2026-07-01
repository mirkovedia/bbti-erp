// E2E del feed "Actividad Reciente" del Command Center. Requiere el server en :3000.
// Parte A: una acción REAL de usuario (POST proyecto) debe dejar fila en actividad_log.
//          (Antes fallaba: registrarActividad insertaba con el cliente de sesión y la
//           RLS de actividad_log —solo SELECT— rechazaba el INSERT en silencio.)
// Parte B: con el dashboard abierto, un INSERT en actividad_log debe aparecer en el
//          feed EN VIVO (< 8s, con destello) vía Supabase Realtime, sin recargar.
//          (Antes fallaba: actividad_log no estaba en la publicación supabase_realtime.)
import { chromium } from 'playwright';
import { getAuthCookie, serviceClient } from './lib/supabase-test.mjs';

const BASE = 'http://localhost:3000';
const svc = serviceClient();
let pass = 0, fail = 0;
const check = (c, m) => { console.log((c ? '✅ ' : '❌ ') + m); c ? pass++ : fail++; };

// ---------- Parte A: acción real → fila en la bitácora ----------
const cookie = await getAuthCookie('admin@bbti.com.pe', 'admin2024');
const H = { 'Content-Type': 'application/json', cookie };

const proy = await (await fetch(`${BASE}/api/proyectos`, {
  method: 'POST', headers: H,
  body: JSON.stringify({ cliente: 'PRUEBA ACTIVIDAD LIVE SAC', monto: 1000 }),
})).json();
const id = proy.id;
check(!!id, `A① proyecto creado (${id})`);

// pequeña espera por si el insert de bitácora corre en paralelo
await new Promise((r) => setTimeout(r, 1500));
const { data: filas } = await svc
  .from('actividad_log').select('accion, usuario, detalle')
  .eq('proyecto_id', id).eq('accion', 'creacion');
check((filas ?? []).length === 1, `A② la creación quedó en actividad_log (${(filas ?? []).length} filas)`);

// ---------- Parte B: feed en vivo vía Realtime ----------
const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await page.fill('input[type="email"]', 'admin@bbti.com.pe');
await page.fill('input[type="password"]', 'admin2024');
await page.click('button[type="submit"]');
await page.waitForURL((u) => !u.pathname.includes('login'), { timeout: 20000 });
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await page.waitForSelector('text=Actividad Reciente', { timeout: 15000 });
// dar tiempo a que el canal Realtime quede suscrito
await page.waitForTimeout(2500);

const marca = `LIVE-PROBE-${Date.now()}`;
await svc.from('actividad_log').insert({
  proyecto_id: id, cliente: 'PRUEBA ACTIVIDAD LIVE SAC',
  usuario: 'Probe Realtime', rol: 'Ingeniería',
  accion: 'firma', detalle: `evento en vivo ${marca}`,
});

// El destello (animate-pulse en el card) SOLO lo pone el handler de Realtime,
// no el polling de 10s → si aparece con destello en <8s, fue por WebSocket.
let liveOk = true;
try {
  await page.waitForSelector(`div.animate-pulse:has-text("${marca}")`, { timeout: 8000 });
} catch {
  liveOk = false;
}
check(liveOk, 'B① el evento apareció EN VIVO en el feed (<8s, con destello Realtime)');

await browser.close();

// Limpieza
await svc.from('proyectos').delete().eq('id', id);
await svc.from('actividad_log').delete().eq('proyecto_id', id);
console.log(`\n===== ${pass} OK / ${fail} fallos ===== (limpiado ${id})`);
process.exit(fail ? 1 : 0);
