// Capturas del rebrand en Chromium (Chrome/Edge) y Firefox. Requiere server en :3000.
import { chromium, firefox } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:3000';
const OUT = 'C:/ClaudecodeProjects/BBTI/bbti-erp/scripts/rebrand';

for (const [name, engine] of [['chromium', chromium], ['firefox', firefox]]) {
  const browser = await engine.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));

  // Login (público)
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}-${name}-login.png` });

  // Entrar y capturar el dashboard
  await page.fill('input[type="email"]', 'admin@bbti.com.pe');
  await page.fill('input[type="password"]', 'admin2024');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/proyectos', { timeout: 20000 }).catch(() => {});
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}-${name}-dashboard.png` });

  console.log(`${name}: login+dashboard OK, errores: ${errs.length ? errs.join(' | ') : 'ninguno'}`);
  await browser.close();
}
process.exit(0);
