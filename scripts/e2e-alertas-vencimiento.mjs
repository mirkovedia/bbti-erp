// Integración: el cron de vencimiento avisa una sola vez por cruce al área
// responsable, deduplica, y limpia (housekeeping) cuando el proyecto deja de aplicar.
import fs from 'fs';
import { db, BASE_URL } from './lib/test-helpers.mjs';

const BASE = BASE_URL;
let envContent = '';
try {
  envContent = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
} catch {
  try {
    envContent = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8');
  } catch {}
}
const SECRET = (process.env.CRON_SECRET || envContent.match(/^CRON_SECRET=(.*)$/m)?.[1] || '').trim();

let pass = 0, fail = 0;
const check = (c, m) => { console.log((c ? '✅ ' : '❌ ') + m); c ? pass++ : fail++; };

const runCron = () =>
  fetch(`${BASE}/api/cron/alertas-vencimiento`, { headers: { authorization: `Bearer ${SECRET}` } });

async function main() {
  try {
    // destinatario esperado: Ingeniería (proyecto nuevo, sin firmas → primera etapa = ingeniería)
    const ingUser = await db.users.findFirst({
      where: { rol: 'Ingeniería', activo: true },
      select: { id: true, nombre: true }
    });

    // 0) auth: sin el header correcto → 401
    const noauth = await fetch(`${BASE}/api/cron/alertas-vencimiento`);
    check(noauth.status === 401, `sin CRON_SECRET → 401 (${noauth.status})`);

    // 1) crear proyecto retrasado (fecha de entrega en el pasado)
    const id = `TEST-VENC-${Date.now()}`;
    await db.proyectos.create({
      data: {
        id,
        cliente: 'PROBE VENCIMIENTO',
        monto: 100000,
        fecha_creacion: '2026-06-23',
        activo: true
      }
    });
    await db.proyecto_comercial.create({
      data: {
        proyecto_id: id,
        fecha_entrega: '2020-01-01'
      }
    });

    await db.notificaciones.deleteMany({ where: { proyecto_id: id } });
    await db.proyecto_alertas_enviadas.deleteMany({ where: { proyecto_id: id } });

    // 2) primer run → debe avisar a Ingeniería + crear fila dedup
    const r1 = await runCron();
    const j1 = await r1.json();
    check(r1.status === 200, `run 1 → 200 (${r1.status})`);
    await new Promise((res) => setTimeout(res, 600));

    const n1 = await db.notificaciones.findMany({ where: { proyecto_id: id } });
    const haciaIng = n1.filter((n) => n.destinatario_id === ingUser?.id && n.tipo === 'vencimiento');
    check(haciaIng.length === 1, `Ingeniería recibió 1 aviso de vencimiento (${haciaIng.length})`);
    if (haciaIng[0]) console.log('   mensaje:', haciaIng[0].mensaje);

    const d1 = await db.proyecto_alertas_enviadas.findMany({ where: { proyecto_id: id } });
    check(d1.length === 1 && d1[0].tipo === 'retrasado', `fila dedup 'retrasado' creada (${d1.length})`);

    // 3) segundo run → NO debe duplicar
    const r2 = await runCron();
    check(r2.status === 200, `run 2 → 200 (${r2.status})`);
    await new Promise((res) => setTimeout(res, 600));

    const n2 = await db.notificaciones.findMany({ where: { proyecto_id: id, tipo: 'vencimiento' } });
    check(n2.length === 1, `sin duplicado tras 2do run (${n2.length})`);

    // 4) reprogramar a futuro lejano → housekeeping borra la fila dedup
    await db.proyecto_comercial.update({
      where: { proyecto_id: id },
      data: { fecha_entrega: '2099-12-31' }
    });
    const r3 = await runCron();
    check(r3.status === 200, `run 3 → 200 (${r3.status})`);

    const d3 = await db.proyecto_alertas_enviadas.findMany({ where: { proyecto_id: id } });
    check(d3.length === 0, `housekeeping limpió la fila dedup (${d3.length})`);

    // limpieza
    await db.notificaciones.deleteMany({ where: { proyecto_id: id } });
    await db.proyecto_alertas_enviadas.deleteMany({ where: { proyecto_id: id } });
    await db.actividad_log.deleteMany({ where: { proyecto_id: id } });
    await db.proyectos.deleteMany({ where: { id } });
    console.log(`\n===== ${pass} OK / ${fail} fallos =====`);
  } catch (err) {
    console.error('Error durante la ejecución del test:', err);
    fail++;
  } finally {
    await db.$disconnect();
    process.exit(fail ? 1 : 0);
  }
}

main();
