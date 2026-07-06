// E2E del feed "Actividad Reciente" del Command Center. Requiere el server en :3000.
// Parte A: una acción REAL de usuario (POST proyecto) debe dejar fila en actividad_log.
// Parte B: con el dashboard abierto, un INSERT en actividad_log debe aparecer en el
//          feed EN VIVO (< 15s, con destello) vía polling, sin recargar.
import { chromium } from 'playwright';
import { getAuthCookie, db, BASE_URL } from './lib/test-helpers.mjs';

const BASE = BASE_URL;
let pass = 0, fail = 0;
const check = (c, m) => { console.log((c ? '✅ ' : '❌ ') + m); c ? pass++ : fail++; };

async function main() {
  try {
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
    const filas = await db.actividad_log.findMany({
      where: {
        proyecto_id: id,
        accion: 'creacion'
      }
    });
    check(filas.length === 1, `A② la creación quedó en actividad_log (${filas.length} filas)`);

    // ---------- Parte B: feed en vivo vía Polling ----------
    const browser = await chromium.launch();
    const page = await (await browser.newContext()).newPage();
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[type="email"]', 'admin@bbti.com.pe');
    await page.fill('input[type="password"]', 'admin2024');
    await page.click('button[type="submit"]');
    await page.waitForURL((u) => !u.pathname.includes('login'), { timeout: 20000 });
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForSelector('text=Actividad Reciente', { timeout: 15000 });
    // dar tiempo a que el primer poll se complete
    await page.waitForTimeout(2500);

    const marca = `LIVE-PROBE-${Date.now()}`;
    await db.actividad_log.create({
      data: {
        proyecto_id: id,
        cliente: 'PRUEBA ACTIVIDAD LIVE SAC',
        usuario: 'Probe Realtime',
        rol: 'Ingeniería',
        accion: 'firma',
        detalle: `evento en vivo ${marca}`,
      }
    });

    // El destello (animate-pulse en el card) lo pone el polling al detectar un evento nuevo
    let liveOk = true;
    try {
      await page.waitForSelector(`div.animate-pulse:has-text("${marca}")`, { timeout: 15000 });
    } catch {
      liveOk = false;
    }
    check(liveOk, 'B① el evento apareció EN VIVO en el feed (<15s, con destello Polling)');

    await browser.close();

    // Limpieza
    await db.proyectos.deleteMany({ where: { id } });
    await db.actividad_log.deleteMany({ where: { proyecto_id: id } });
    console.log(`\n===== ${pass} OK / ${fail} fallos ===== (limpiado ${id})`);
  } catch (err) {
    console.error('Error durante la ejecución del test:', err);
    fail++;
  } finally {
    await db.$disconnect();
    process.exit(fail ? 1 : 0);
  }
}

main();
