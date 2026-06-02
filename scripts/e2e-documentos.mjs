// scripts/e2e-documentos.mjs
import { chromium } from 'playwright';
import fs from 'fs';

const BASE = 'http://localhost:3000';
const log = (...a) => console.log(...a);
const tmpFile = 'scripts/_e2e-doc.txt';
fs.writeFileSync(tmpFile, 'documento de prueba e2e ' + Date.now());

const browser = await chromium.launch();
const page = await browser.newContext().then((c) => c.newPage());
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

try {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', 'admin@bbti.com.pe');
  await page.fill('input[type="password"]', 'admin2024');
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes('login'), { timeout: 15000 });

  await page.goto(`${BASE}/proyectos/PR-01-2026`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.click('button:has-text("Ingeniería")');
  await page.waitForTimeout(800);

  // Subir
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.click('button:has-text("Subir documento")'),
  ]);
  await chooser.setFiles(tmpFile);
  await page.waitForTimeout(4000);
  const subido = await page.locator('text=_e2e-doc.txt').count();
  log('Documento aparece tras subir:', subido ? 'SÍ ✅' : 'NO ❌');

  // Eliminar (solo hay un documento, así que el botón Eliminar es único)
  await page.locator('button[title="Eliminar"]').first().click();
  await page.waitForTimeout(5000);
  const sigue = await page.locator('text=_e2e-doc.txt').count();
  log('Documento eliminado:', sigue === 0 ? 'SÍ ✅' : 'NO ❌');

  log('PAGE ERRORS:', pageErrors.length);
  pageErrors.forEach((e) => log('  ', e));
} catch (err) {
  log('✖ EXCEPCIÓN:', err.message);
} finally {
  fs.unlinkSync(tmpFile);
  await browser.close();
}
