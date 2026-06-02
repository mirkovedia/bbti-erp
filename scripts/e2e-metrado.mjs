// scripts/e2e-metrado.mjs — E2E del flujo importar metrado -> Logística
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
  // Tab Comercial es la activa por defecto
  await page.click('button:has-text("Comercial")');
  await page.waitForTimeout(600);

  // Verificar que el botón existe
  const btn = await page.locator('button:has-text("Importar metrado")').count();
  log('Botón "Importar metrado" presente:', btn ? 'SÍ' : 'NO');

  // Subir el Excel directamente al input oculto
  await page.locator('input[accept=".xlsx,.xls"]').setInputFiles('metrado.xlsx');
  await page.waitForTimeout(2500);

  // El modal debe mostrar 112 materiales
  const modalText = await page.locator('text=/materiales/').first().textContent().catch(() => '');
  log('Modal:', (modalText || '').trim());
  const muestra112 = await page.locator('text=112 materiales').count();
  log('Modal muestra "112 materiales":', muestra112 ? 'SÍ ✅' : 'NO ❌');

  // Confirmar importación
  await page.click('button:has-text("Importar a Logística")');
  await page.waitForTimeout(4000);

  // Ir a Logística
  await page.click('button:has-text("Logística")');
  await page.waitForTimeout(1500);
  const titulo = await page.locator('text=/Materiales \\(/').first().textContent().catch(() => '');
  log('Logística:', (titulo || '').trim());
  const tiene112 = (titulo || '').includes('(112)');
  log('Logística tiene 112 materiales:', tiene112 ? 'SÍ ✅' : 'NO ❌');

  // Verificar que aparece un código (1.01) y un precio (S/)
  const tieneCodigo = await page.locator('td:has-text("1.01")').count();
  const tienePrecio = await page.locator('text=/S\\/ 8,840/').count();
  log('Muestra código 1.01:', tieneCodigo ? 'SÍ ✅' : 'NO ❌');
  log('Muestra precio del primer material:', tienePrecio ? 'SÍ ✅' : 'NO ❌');

  log('\nPAGE ERRORS:', pageErrors.length);
  pageErrors.slice(0, 5).forEach((e) => log('  ', e.slice(0, 120)));
} catch (err) {
  log('✖ EXCEPCIÓN:', err.message.split('\n')[0]);
} finally {
  await browser.close();
}
