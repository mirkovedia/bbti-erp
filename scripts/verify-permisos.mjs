// Verifica el modelo "ver todo, editar solo lo suyo" con un rol no-financiero (Comercial).
import { chromium } from 'playwright';
import { serviceClient, getAuthCookie } from './lib/supabase-test.mjs';
const BASE = process.env.BASE || 'http://localhost:3000';
const svc = serviceClient();

// crear un proyecto de prueba (con admin) para tener algo que abrir en Finanzas
const cookieAdmin = await getAuthCookie('admin@bbti.com.pe', 'admin2024');
const proy = await (await fetch(`${BASE}/api/proyectos`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: cookieAdmin }, body: JSON.stringify({ cliente: 'PRUEBA PERMISOS', monto: 5000, adelanto: 1000 }) })).json();
const pid = proy.id;
console.log('proyecto de prueba:', pid);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? 'OK  ' : 'XX  ') + m); c ? pass++ : fail++; };

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

// 3) navegar por URL a /usuarios → bloqueado
await page.goto(`${BASE}/usuarios`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
const restringido = await page.getByText('Acceso restringido').count();
ok(restringido > 0, '/usuarios bloqueado por URL para Comercial');

console.log(`\n===== ${pass} OK / ${fail} fallos =====`);
await browser.close();
// limpieza
await svc.from('proyectos').delete().eq('id', pid);
process.exit(fail ? 1 : 0);
