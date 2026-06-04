// E2E REAL del flujo: crea un proyecto (API), y EN EL NAVEGADOR sube el metrado
// real, recorre las 5 áreas y verifica que el estado avanza hasta COMPLETADO.
import { chromium } from 'playwright';
import fs from 'fs';
import { getAuthCookie, serviceClient } from './lib/supabase-test.mjs';

const BASE = 'http://localhost:3000';
const log = (...a) => console.log(...a);
let pass = 0, fail = 0;
const check = (cond, msg) => { console.log((cond ? '✅ ' : '❌ ') + msg); cond ? pass++ : fail++; };

// 1) Crear el proyecto vía API (el modal funciona para usuarios reales; aquí lo
//    creamos por API para no depender del submit programático del formulario).
const cookie = await getAuthCookie('admin@bbti.com.pe', 'admin2024');
const crear = await fetch(`${BASE}/api/proyectos`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', cookie },
  body: JSON.stringify({ cliente: 'TEST FLUJO REAL', monto: 200000, fecha_entrega: '2026-12-31', dias_plazo: 90, adelanto: 50000 }),
});
const proy = await crear.json();
const projId = proy.id;
check(crear.status === 201 && !!projId, `① Proyecto creado por API: ${projId} (estado ${proy.estado})`);

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1366, height: 900 } }).then((c) => c.newPage());
page.on('dialog', (d) => d.accept());
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

// click por texto vía .click() del DOM (dispara onClick de React sin esperar "estabilidad")
const clic = async (texto) => {
  const r = await page.evaluate((t) => {
    const el = [...document.querySelectorAll('button')].find((b) => b.textContent.trim().includes(t));
    if (el) { el.click(); return true; } return false;
  }, texto);
  if (!r) throw new Error(`No se encontró botón "${texto}"`);
  await page.waitForTimeout(500);
};
const badge = async () =>
  ((await page.locator('span').filter({ hasText: /^(EN INGENIERÍA|COMPRAS EN CURSO|EN PRODUCCIÓN|LISTO PARA PRUEBAS|COMPLETADO|RETRASADO)$/ }).first().textContent().catch(() => '?')) || '?').trim();
const tab = async (name) => { await clic(name); await page.waitForTimeout(900); };

try {
  // LOGIN + abrir el proyecto
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', 'admin@bbti.com.pe');
  await page.fill('input[type="password"]', 'admin2024');
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes('login'), { timeout: 20000 });
  await page.goto(`${BASE}/proyectos/${projId}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('h1:has-text("PR-")', { timeout: 15000 });
  await page.waitForTimeout(1500);
  check((await badge()) === 'EN INGENIERÍA', `estado inicial en UI = EN INGENIERÍA (${await badge()})`);

  // ② COMERCIAL: importar el metrado real
  log('\n② Comercial: subir metrado.xlsx...');
  await tab('Comercial');
  await page.locator('input[accept=".xlsx,.xls"]').setInputFiles('metrado.xlsx');
  await page.waitForTimeout(2500);
  check((await page.locator('text=73 materiales').count()) > 0, 'modal: Precios Equipos = 73 materiales');
  await clic('Importar a Logística');
  await page.waitForTimeout(4500);
  await tab('Logística');
  const titLog = (await page.locator('text=/Materiales \\(/').first().textContent().catch(() => '')) || '';
  check(titLog.includes('(73)'), `Logística cargó 73 materiales (${titLog.trim()})`);

  // ③ INGENIERÍA: subir un plano y ponerlo "Aprobados y firmados" → COMPRAS EN CURSO
  log('\n③ Ingeniería: subir plano y aprobarlo...');
  await tab('Ingeniería');
  const planoTmp = 'scripts/_plano_v1.pdf';
  fs.writeFileSync(planoTmp, 'plano de prueba ' + Date.now());
  await page.locator('input[type="file"]').first().setInputFiles(planoTmp);
  await page.waitForTimeout(4500);
  // poner el estado del documento a "Aprobados y firmados"
  await page.locator('select').first().selectOption('Aprobados y firmados');
  await page.waitForTimeout(2800);
  fs.unlinkSync(planoTmp);
  check((await badge()) === 'COMPRAS EN CURSO', `plano aprobado y firmado → COMPRAS EN CURSO (${await badge()})`);

  // ④ LOGÍSTICA: comprar todos los materiales → EN PRODUCCIÓN
  log('\n④ Logística: comprar todos los materiales...');
  await tab('Logística');
  const inputs = page.locator('table tbody input[type="number"]');
  const n = await inputs.count();
  log(`   marcando ${n} materiales como comprados...`);
  for (let i = 0; i < n; i++) await inputs.nth(i).fill('99999');
  await clic('Guardar cambios');
  await page.waitForTimeout(4500);
  check((await badge()) === 'EN PRODUCCIÓN', `materiales completos → EN PRODUCCIÓN (${await badge()})`);

  // ⑤ PRODUCCIÓN: etapas 100% → LISTO PARA PRUEBAS; pruebas+envío → COMPLETADO
  log('\n⑤ Producción: completar etapas, pruebas y envío...');
  await tab('Producción');
  const selects = page.locator('select');
  const ne = await selects.count();
  for (let i = 0; i < ne; i++) { await selects.nth(i).selectOption('COMPLETADO'); await page.waitForTimeout(1400); }
  await page.waitForTimeout(2500); // dejar que el refetch de la última etapa actualice el badge
  check((await badge()) === 'LISTO PARA PRUEBAS', `producción 100% → LISTO PARA PRUEBAS (${await badge()})`);
  const checks = page.locator('input[type="checkbox"]');
  for (let i = 0; i < (await checks.count()); i++) { if (!(await checks.nth(i).isChecked())) await checks.nth(i).check(); }
  await clic('Guardar');
  await page.waitForTimeout(3000);
  check((await badge()) === 'COMPLETADO', `pruebas + envío → COMPLETADO (${await badge()})`);

  // captura final
  await page.screenshot({ path: 'scripts/_flujo-final.png' });
  log('  (captura final: scripts/_flujo-final.png)');
  log('\nPAGE ERRORS:', pageErrors.length);
  pageErrors.slice(0, 4).forEach((e) => log('  ', e.slice(0, 120)));
} catch (err) {
  log('✖ EXCEPCIÓN:', err.message.split('\n')[0]);
  await page.screenshot({ path: 'scripts/_flujo-error.png' }).catch(() => {});
  fail++;
} finally {
  await serviceClient().from('proyectos').delete().eq('id', projId);
  await browser.close();
  log(`\n(limpiado ${projId})`);
  log(`===== ${pass} OK / ${fail} fallos =====`);
  process.exit(fail ? 1 : 0);
}
