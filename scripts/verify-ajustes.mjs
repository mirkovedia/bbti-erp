// Verifica los ajustes de UI: OC/Especificaciones en Comercial, días read-only,
// Planos de despiece en Ingeniería, y formato de dinero con coma.
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:3000';
const PR = process.env.PR || 'PR-04-2026';
const results = [];
const ok = (n, cond) => { results.push([cond ? 'OK ' : 'XX ', n]); };

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });

await p.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await p.fill('input[type=email]', 'admin@bbti.com.pe');
await p.fill('input[type=password]', 'admin2024');
await p.click('button[type=submit]');
await p.waitForURL('**/proyectos', { timeout: 20000 }).catch(() => {});

await p.goto(`${BASE}/proyectos/${PR}`, { waitUntil: 'networkidle' });
await p.waitForTimeout(2500);

// 1) Formato de dinero con coma en el encabezado (ej. "S/ 310,000.00")
const header = await p.locator('body').innerText();
ok('Dinero con coma (S/ ###,###)', /S\/\s*[\d]{1,3},[\d]{3}/.test(header));

// 2) Pestaña Comercial: OC + Especificaciones + días read-only
await p.getByRole('button', { name: /Comercial/i }).first().click().catch(() => {});
await p.waitForTimeout(1200);
const comercial = await p.locator('body').innerText();
ok('Comercial: Orden de Compra (OC)', /Orden de Compra/i.test(comercial));
ok('Comercial: Especificaciones Técnicas', /Especificaciones T[eé]cnicas/i.test(comercial));
ok('Comercial: Días de Plazo (automático)', /autom[aá]tico/i.test(comercial));
const diasReadonly = await p.evaluate(() => {
  const inputs = Array.from(document.querySelectorAll('input[type=number]'));
  return inputs.some((i) => i.readOnly && (i.title || '').includes('fecha de entrega'));
});
ok('Comercial: campo Días es read-only', diasReadonly);

// 3) Pestaña Ingeniería: Planos de despiece
await p.getByRole('button', { name: /Ingenier[ií]a/i }).first().click().catch(() => {});
await p.waitForTimeout(1200);
const ing = await p.locator('body').innerText();
ok('Ingeniería: Planos de despiece', /Planos de despiece/i.test(ing));

console.log(`\n=== Verificación de ajustes (${PR}) ===`);
for (const [s, n] of results) console.log(s, n);
const fallos = results.filter((r) => r[0].startsWith('XX')).length;
console.log(`\n${results.length - fallos} OK / ${fallos} fallos`);
await b.close();
process.exit(fallos ? 1 : 0);
