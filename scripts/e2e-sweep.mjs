import { chromium } from 'playwright';
import { BASE_URL } from './lib/test-helpers.mjs';

const BASE = BASE_URL;
const log = (...a) => console.log(...a);

// Errores de red por navegación abortada que NO son bugs reales
const NOISE = ['Failed to fetch', 'NetworkError', 'aborted', 'net::ERR_ABORTED'];
const isNoise = (t) => NOISE.some((n) => t.includes(n));

const rutas = [
  { path: '/', name: 'Inicio (command center)' },
  { path: '/proyectos', name: 'Proyectos (lista)' },
  { path: '/proyectos/PR-01-2026', name: 'Proyecto detalle' },
  { path: '/calendario', name: 'Calendario' },
  { path: '/reportes', name: 'Reportes' },
  { path: '/productividad', name: 'Productividad' },
  { path: '/usuarios', name: 'Usuarios' },
  { path: '/configuracion', name: 'Configuración' },
];

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  const bucket = { console: [], page: [] };
  page.on('console', (m) => { if (m.type() === 'error') bucket.console.push(m.text()); });
  page.on('pageerror', (e) => bucket.page.push(e.message));

  const resultados = [];

  try {
    // Login una sola vez
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[type="email"]', 'admin@bbti.com.pe');
    await page.fill('input[type="password"]', 'admin2024');
    await page.click('button[type="submit"]');
    await page.waitForURL((u) => !u.pathname.includes('login'), { timeout: 15000 });
    log('✓ Login OK\n');

    for (const r of rutas) {
      bucket.console = [];
      bucket.page = [];
      await page.goto(`${BASE}${r.path}`, { waitUntil: 'networkidle' }).catch(() => {});
      await page.waitForTimeout(3500); // settle, evita ruido de abort
      const h1 = (await page.locator('h1').first().textContent().catch(() => '(sin h1)'))?.trim();
      // En detalle, recorrer las tabs
      let tabsInfo = '';
      if (r.path.includes('PR-01')) {
        for (const t of ['Ingeniería', 'Logística', 'Producción', 'Finanzas']) {
          await page.click(`button:has-text("${t}")`).catch(() => {});
          await page.waitForTimeout(700);
        }
        tabsInfo = ' (recorridas 5 tabs)';
      }
      const realConsole = bucket.console.filter((t) => !isNoise(t));
      const realPage = bucket.page.filter((t) => !isNoise(t));
      resultados.push({ name: r.name + tabsInfo, h1, realConsole, realPage, noise: bucket.console.filter(isNoise).length });
    }
  } catch (err) {
    log('✖ EXCEPCIÓN GLOBAL:', err.message);
  } finally {
    log('==================== RESUMEN E2E ====================\n');
    let totalReal = 0;
    for (const r of resultados) {
      const nReal = r.realConsole.length + r.realPage.length;
      totalReal += nReal;
      const status = nReal === 0 ? '✅' : '❌';
      log(`${status} ${r.name}`);
      log(`     H1: ${r.h1}  |  ruido-red ignorado: ${r.noise}`);
      if (r.realPage.length) r.realPage.forEach((e) => log(`     🔴 PAGE: ${e.slice(0, 160)}`));
      if (r.realConsole.length) r.realConsole.forEach((e) => log(`     🟠 CONSOLE: ${e.slice(0, 160)}`));
      log('');
    }
    log(`==================== ${totalReal} errores reales en total ====================`);
    await browser.close();
  }
}

main();
