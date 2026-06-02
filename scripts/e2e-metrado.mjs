// scripts/e2e-metrado.mjs — E2E del flujo importar metrado -> Logística (con selector de hoja)
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const log = (...a) => console.log(...a);
const browser = await chromium.launch();
const page = await browser.newContext().then((c) => c.newPage());
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

try {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', 'admin@bbti.com.pe');
  await page.fill('input[type="password"]', 'admin2024');
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes('login'), { timeout: 20000 });

  await page.goto(`${BASE}/proyectos/PR-01-2026`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.click('button:has-text("Comercial")');
  await page.waitForTimeout(600);

  // Subir el Excel
  await page.locator('input[accept=".xlsx,.xls"]').setInputFiles('metrado.xlsx');
  await page.waitForTimeout(2500);

  // El selector de hoja debe existir y por defecto sugerir "Precios Equipos" (73)
  const selectVal = await page.locator('select').filter({ hasText: 'materiales' }).first().inputValue().catch(() => '');
  log('Hoja seleccionada por defecto:', selectVal || '(no detectada)');
  const opciones = await page.locator('select option').allTextContents().catch(() => []);
  log('Opciones de hoja:', opciones.filter((o) => o.includes('materiales')).slice(0, 4).join(' | '));

  const muestra73 = await page.locator('text=73 materiales').count();
  log('Modal muestra "73 materiales" (Precios Equipos):', muestra73 ? 'SÍ ✅' : 'NO ❌');
  const tieneInterruptor = await page.locator('text=/ITM 2x16A/').count();
  log('Preview muestra interruptor "ITM 2x16A" (no tablero):', tieneInterruptor ? 'SÍ ✅' : 'NO ❌');

  // Confirmar importación
  await page.click('button:has-text("Importar a Logística")');
  await page.waitForTimeout(4000);

  // Logística
  await page.click('button:has-text("Logística")');
  await page.waitForTimeout(1500);
  const titulo = await page.locator('text=/Materiales \\(/').first().textContent().catch(() => '');
  log('Logística:', (titulo || '').trim());
  log('Logística tiene 73 materiales:', (titulo || '').includes('(73)') ? 'SÍ ✅' : 'NO ❌');
  const tieneItm = await page.locator('td:has-text("ITM 2x16A")').count();
  log('Logística muestra interruptor ITM 2x16A:', tieneItm ? 'SÍ ✅' : 'NO ❌');

  log('\nPAGE ERRORS:', pageErrors.length);
  pageErrors.slice(0, 5).forEach((e) => log('  ', e.slice(0, 120)));
} catch (err) {
  log('✖ EXCEPCIÓN:', err.message.split('\n')[0]);
} finally {
  await browser.close();
}
