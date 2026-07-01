// Integración: el cron de vencimiento avisa una sola vez por cruce al área
// responsable, deduplica, y limpia (housekeeping) cuando el proyecto deja de aplicar.
import fs from 'fs';
import { serviceClient } from './lib/supabase-test.mjs';

const BASE = process.env.BASE || 'http://localhost:3000';
const env = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const SECRET = (env.match(/^CRON_SECRET=(.*)$/m)?.[1] || '').trim();
const svc = serviceClient();
let pass = 0, fail = 0;
const check = (c, m) => { console.log((c ? '✅ ' : '❌ ') + m); c ? pass++ : fail++; };

const runCron = () =>
  fetch(`${BASE}/api/cron/alertas-vencimiento`, { headers: { authorization: `Bearer ${SECRET}` } });

// destinatario esperado: Ingeniería (proyecto nuevo, sin firmas → primera etapa = ingeniería)
const { data: ingUser } = await svc
  .from('users').select('id,nombre').eq('rol', 'Ingeniería').eq('activo', true).limit(1).maybeSingle();

// 0) auth: sin el header correcto → 401
const noauth = await fetch(`${BASE}/api/cron/alertas-vencimiento`);
check(noauth.status === 401, `sin CRON_SECRET → 401 (${noauth.status})`);

// 1) crear proyecto retrasado (fecha de entrega en el pasado)
const id = `TEST-VENC-${Date.now()}`;
// fecha_creacion es NOT NULL sin default; activo viene de la migración 010.
await svc.from('proyectos').insert({ id, cliente: 'PROBE VENCIMIENTO', monto: 100000, fecha_creacion: '2026-06-23', activo: true });
await svc.from('proyecto_comercial').insert({ proyecto_id: id, fecha_entrega: '2020-01-01' });
await svc.from('notificaciones').delete().eq('proyecto_id', id);
await svc.from('proyecto_alertas_enviadas').delete().eq('proyecto_id', id);

// 2) primer run → debe avisar a Ingeniería + crear fila dedup
const r1 = await runCron();
const j1 = await r1.json();
check(r1.status === 200, `run 1 → 200 (${r1.status})`);
await new Promise((res) => setTimeout(res, 600));
const { data: n1 } = await svc.from('notificaciones').select('*').eq('proyecto_id', id);
const haciaIng = (n1 || []).filter((n) => n.destinatario_id === ingUser?.id && n.tipo === 'vencimiento');
check(haciaIng.length === 1, `Ingeniería recibió 1 aviso de vencimiento (${haciaIng.length})`);
if (haciaIng[0]) console.log('   mensaje:', haciaIng[0].mensaje);
const { data: d1 } = await svc.from('proyecto_alertas_enviadas').select('*').eq('proyecto_id', id);
check(d1?.length === 1 && d1[0].tipo === 'retrasado', `fila dedup 'retrasado' creada (${d1?.length})`);

// 3) segundo run → NO debe duplicar
const r2 = await runCron();
check(r2.status === 200, `run 2 → 200 (${r2.status})`);
await new Promise((res) => setTimeout(res, 600));
const { data: n2 } = await svc.from('notificaciones').select('*').eq('proyecto_id', id).eq('tipo', 'vencimiento');
check((n2 || []).length === 1, `sin duplicado tras 2do run (${(n2 || []).length})`);

// 4) reprogramar a futuro lejano → housekeeping borra la fila dedup
await svc.from('proyecto_comercial').update({ fecha_entrega: '2099-12-31' }).eq('proyecto_id', id);
const r3 = await runCron();
check(r3.status === 200, `run 3 → 200 (${r3.status})`);
const { data: d3 } = await svc.from('proyecto_alertas_enviadas').select('*').eq('proyecto_id', id);
check((d3 || []).length === 0, `housekeeping limpió la fila dedup (${(d3 || []).length})`);

// limpieza
await svc.from('notificaciones').delete().eq('proyecto_id', id);
await svc.from('proyecto_alertas_enviadas').delete().eq('proyecto_id', id);
await svc.from('actividad_log').delete().eq('proyecto_id', id); // la bitácora no tiene FK: limpiar aparte
await svc.from('proyectos').delete().eq('id', id);
console.log(`\n===== ${pass} OK / ${fail} fallos =====`);
process.exit(fail ? 1 : 0);
