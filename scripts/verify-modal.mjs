// Verifica que el modal abre SIN congelar el hilo (regresión del bucle infinito).
import { chromium } from 'playwright';
import { db, BASE_URL } from './lib/test-helpers.mjs';
const BASE = BASE_URL;

async function main() {
  const browser = await chromium.launch();
  let pass = 0, fail = 0;
  const ok = (c, m) => { console.log((c ? 'OK  ' : 'XX  ') + m); c ? pass++ : fail++; };

  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    let modalRenders = 0;
    page.on('console', (m) => { if (/\[MODAL\] render start/.test(m.text())) modalRenders++; });

    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[type="email"]', 'admin@bbti.com.pe');
    await page.fill('input[type="password"]', 'admin2024');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/proyectos', { timeout: 20000 }).catch(() => {});
    await page.waitForSelector('text=Nueva Orden', { timeout: 15000 });
    await page.waitForTimeout(800);

    // 1) abrir el modal — el click debe COMPLETAR
    const t0 = Date.now();
    let clickOk = true;
    await page.getByRole('button', { name: /Nueva Orden/i }).click({ timeout: 6000 }).catch(() => { clickOk = false; });
    ok(clickOk, `click Nueva Orden completa (${Date.now() - t0}ms)`);

    // 2) el modal aparece
    const visible = await page.getByText('Nueva Orden de Proyecto').isVisible().catch(() => false);
    ok(visible, 'modal visible');

    // 3) el hilo responde (no congelado)
    let alive = false;
    try { alive = await Promise.race([page.evaluate(() => 2 + 2 === 4), new Promise((_, r) => setTimeout(() => r(new Error('frozen')), 3000))]); }
    catch { alive = false; }
    ok(alive === true, 'hilo responde (no congelado)');

    // 4) crear un proyecto completo y confirmar que NO se cuelga después
    await page.fill('input[placeholder="Nombre del cliente"]', 'VERIFY MODAL SAC');
    await page.locator('input[placeholder="0.00"]').nth(0).fill('1000');
    await page.getByRole('button', { name: /Crear Proyecto/i }).click();
    const cerrado = await page.waitForSelector('text=Nueva Orden de Proyecto', { state: 'detached', timeout: 8000 }).then(() => true).catch(() => false);
    ok(cerrado, 'tras Crear, el modal cierra (sin colgarse)');
    let aliveAfter = false;
    try { aliveAfter = await Promise.race([page.evaluate(() => true), new Promise((_, r) => setTimeout(() => r(new Error('frozen')), 3000))]); }
    catch { aliveAfter = false; }
    ok(aliveAfter === true, 'hilo responde tras crear');

    console.log(`\n[MODAL] render start contados: ${modalRenders} (debe ser pocos, NO cientos)`);
  } catch (err) {
    console.error('Error durante la ejecución del test:', err);
    fail++;
  } finally {
    // limpieza
    const data = await db.proyectos.findMany({ where: { cliente: 'VERIFY MODAL SAC' }, select: { id: true } });
    for (const p of data) {
      await db.proyectos.deleteMany({ where: { id: p.id } });
      await db.actividad_log.deleteMany({ where: { proyecto_id: p.id } });
    }
    await browser.close();
    await db.$disconnect();
    console.log(`===== ${pass} OK / ${fail} fallos =====`);
    process.exit(fail ? 1 : 0);
  }
}

main();
