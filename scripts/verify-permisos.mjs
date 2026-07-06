// Verifica el modelo "ver todo, editar solo lo suyo" con un rol no-financiero (Comercial).
import { chromium } from 'playwright';
import { db, getAuthCookie, BASE_URL } from './lib/test-helpers.mjs';
const BASE = BASE_URL;

async function main() {
  let pid = null;
  const browser = await chromium.launch();
  let pass = 0, fail = 0;
  const ok = (c, m) => { console.log((c ? 'OK  ' : 'XX  ') + m); c ? pass++ : fail++; };

  try {
    // crear un proyecto de prueba (con admin) para tener algo que abrir en Finanzas
    const cookieAdmin = await getAuthCookie('admin@bbti.com.pe', 'admin2024');
    const proy = await (await fetch(`${BASE}/api/proyectos`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: cookieAdmin }, body: JSON.stringify({ cliente: 'PRUEBA PERMISOS', monto: 5000, adelanto: 1000 }) })).json();
    pid = proy.id;
    console.log('proyecto de prueba:', pid);

    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

    // login como COMERCIAL (no ve finanzas hoy)
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[type="email"]', 'jflores@bbti.com.pe');
    await page.fill('input[type="password"]', 'jflores03');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/proyectos', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1000);

    // 1) sidebar: NO debe ver Usuarios ni Configuración
    const sidebar = page.locator('aside');
    ok(await sidebar.getByText('Usuarios', { exact: true }).count() === 0, 'sidebar SIN "Usuarios" (Comercial)');
    ok(await sidebar.getByText('Configuración', { exact: true }).count() === 0, 'sidebar SIN "Configuración" (Comercial)');
    ok(await sidebar.getByText('Proyectos', { exact: true }).count() > 0, 'sidebar CON "Proyectos"');

    // 2) entrar a un proyecto y abrir la pestaña Finanzas → debe VER datos (no "Sin permiso")
    await page.goto(`${BASE}/proyectos/${pid}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: 'Finanzas' }).click().catch(() => {});
    await page.waitForTimeout(1200);
    const sinPermiso = await page.getByText('No tienes permisos para ver información financiera').count();
    ok(sinPermiso === 0, 'Comercial VE la pestaña Finanzas (sin candado)');

    // 2.5) Ingeniería: Comercial no debe ver botón de subir plano ni poder generar la URL
    await page.goto(`${BASE}/proyectos/${pid}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: 'Ingeniería' }).click().catch(() => {});
    await page.waitForTimeout(1200);
    const subirBtn = await page.getByRole('button', { name: 'Subir plano / documento' }).count();
    ok(subirBtn === 0, 'Comercial NO ve el botón "Subir plano / documento" en Ingeniería');

    const apiRes = await page.evaluate(async (projectId) => {
      const res = await fetch('/api/documentos/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proyecto_id: projectId, filename: 'plano_infiltrado.pdf', content_type: 'application/pdf', size: 100 }),
      });
      return res.status;
    }, pid);
    ok(apiRes === 403, 'API upload-url bloquea subida de planos a Comercial con 403');

    // 3) navegar por URL a /usuarios → bloqueado
    await page.goto(`${BASE}/usuarios`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    const restringido = await page.getByText('Acceso restringido').count();
    ok(restringido > 0, '/usuarios bloqueado por URL para Comercial');

  } catch (err) {
    console.error('Error durante la ejecución del test:', err);
    fail++;
  } finally {
    if (pid) {
      await db.proyectos.deleteMany({ where: { id: pid } });
      await db.actividad_log.deleteMany({ where: { proyecto_id: pid } });
    }
    await browser.close();
    await db.$disconnect();
    console.log(`\n===== ${pass} OK / ${fail} fallos =====`);
    process.exit(fail ? 1 : 0);
  }
}

main();
