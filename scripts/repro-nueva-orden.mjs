// Repro del cuelgue al click en "Nueva Orden". Captura errores de consola/página.
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'https://bbti-erp.vercel.app';

const browser = await chromium.launch();
const page = await browser.newPage();
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));

console.log('1) login…');
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await page.fill('input[type="email"]', 'jflores@bbti.com.pe');
await page.fill('input[type="password"]', 'jflores03');
await page.click('button[type="submit"]');
await page.waitForURL('**/proyectos', { timeout: 20000 }).catch(() => {});
await page.waitForLoadState('networkidle').catch(() => {});
console.log('   url tras login:', page.url());

// asegurarse de estar en /proyectos
if (!page.url().includes('/proyectos')) {
  await page.goto(`${BASE}/proyectos`, { waitUntil: 'networkidle' });
}

console.log('2) click "Nueva Orden"…');
errs.length = 0; // limpiar errores previos
await page.getByRole('button', { name: /Nueva Orden/i }).click({ timeout: 10000 }).catch((e) => console.log('   click err:', e.message));

// esperar a ver si aparece el modal o si truena
await page.waitForTimeout(2500);
const modalVisible = await page.getByText('Nueva Orden de Proyecto').isVisible().catch(() => false);
console.log('3) ¿modal visible?:', modalVisible);

// probar si la página sigue respondiendo (evaluar JS simple con timeout)
let responsive = false;
try {
  responsive = await Promise.race([
    page.evaluate(() => { return 1 + 1 === 2; }),
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout 4s — hilo bloqueado')), 4000)),
  ]);
} catch (e) { responsive = 'CONGELADO: ' + e.message; }
console.log('4) ¿hilo principal responde?:', responsive);

console.log('5) errores capturados:');
console.log(errs.length ? errs.join('\n') : '   (ninguno)');

await browser.close();
process.exit(0);
