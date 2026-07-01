// Verifica que el botón de papelera elimina un proyecto desde la lista (UI real).
import { chromium } from 'playwright';
import { serviceClient } from './lib/supabase-test.mjs';
const BASE = process.env.BASE || 'http://localhost:3000';
const svc = serviceClient();

// crear un proyecto de prueba para borrar
const cookieRaw = await (await import('./lib/supabase-test.mjs')).getAuthCookie('admin@bbti.com.pe', 'admin2024');
const proy = await (await fetch(`${BASE}/api/proyectos`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: cookieRaw }, body: JSON.stringify({ cliente: 'PARA BORRAR UI', monto: 500 }) })).json();
console.log('proyecto de prueba:', proy.id);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('dialog', (d) => d.accept()); // aceptar el confirm()

let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? 'OK  ' : 'XX  ') + m); c ? pass++ : fail++; };

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await page.fill('input[type="email"]', 'admin@bbti.com.pe');
await page.fill('input[type="password"]', 'admin2024');
await page.click('button[type="submit"]');
await page.waitForURL('**/proyectos', { timeout: 20000 }).catch(() => {});
await page.waitForSelector(`text=${proy.id}`, { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(800);

// 1) hilo responde (no se colgó al cargar la lista con la columna nueva)
let alive = false;
try { alive = await Promise.race([page.evaluate(() => 1 + 1 === 2), new Promise((_, r) => setTimeout(() => r(new Error('x')), 3000))]); } catch { alive = false; }
ok(alive === true, 'lista responde (sin bucle tras agregar la columna)');

// 2) la fila del proyecto existe
const fila = page.locator('tr', { hasText: proy.id });
ok(await fila.count() > 0, `fila ${proy.id} visible`);

// 3) click en la papelera de esa fila → confirm → se elimina
await fila.locator('button[title="Eliminar proyecto"]').click();
await page.waitForTimeout(1500);
const sigueEnLista = await page.locator('tr', { hasText: proy.id }).count();
ok(sigueEnLista === 0, 'tras eliminar, la fila desaparece de la lista');

// 4) borrado SUAVE en la BD (papelera, migración 010): la fila queda con activo=false
const { data } = await svc.from('proyectos').select('id, activo').eq('id', proy.id);
ok((data ?? []).length === 1 && data[0].activo === false, 'proyecto en papelera (activo=false, recuperable)');

// limpieza por si quedó algo
await svc.from('proyectos').delete().eq('id', proy.id);
await svc.from('actividad_log').delete().eq('proyecto_id', proy.id);
console.log(`\n===== ${pass} OK / ${fail} fallos =====`);
await browser.close();
process.exit(fail ? 1 : 0);
