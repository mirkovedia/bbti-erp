// Crea un proyecto real y recorre el flujo verificando que el estado progresa.
import { getAuthCookie, serviceClient } from './lib/supabase-test.mjs';
const BASE = 'http://localhost:3000';
const cookie = await getAuthCookie('admin@bbti.com.pe', 'admin2024');
const svc = serviceClient();
const H = { 'Content-Type': 'application/json', cookie };
const log = (...a) => console.log(...a);
let pass = 0, fail = 0;
const expect = (estado, esperado, etapa) => {
  const ok = estado === esperado;
  console.log((ok ? 'OK  ' : 'XX  ') + `${etapa}: estado = "${estado}" (esperado "${esperado}")`);
  ok ? pass++ : fail++;
};
const getEstado = async (id) => (await (await fetch(`${BASE}/api/proyectos/${id}`, { headers: { cookie } })).json()).estado;

const proy = await (await fetch(`${BASE}/api/proyectos`, { method: 'POST', headers: H,
  body: JSON.stringify({ cliente: 'PRUEBA FLUJO SAC', monto: 50000, fecha_entrega: '2026-09-30', dias_plazo: 60, adelanto: 15000 }) })).json();
const id = proy.id;
expect(proy.estado, 'EN INGENIERÍA', '① Crear');

await fetch(`${BASE}/api/proyectos/${id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ ingenieria: { estado_planos: 'Aprobados' } }) });
expect(await getEstado(id), 'COMPRAS EN CURSO', '② Planos aprobados');

await fetch(`${BASE}/api/proyectos/${id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ materiales: [
  { nombre: 'Interruptor 2P 200A', cantidad: 8, unidad: 'und', comprado: 8, estado: 'COMPLETO' },
  { nombre: 'Cable THW 10mm2', cantidad: 200, unidad: 'm', comprado: 200, estado: 'COMPLETO' } ] }) });
expect(await getEstado(id), 'EN PRODUCCIÓN', '③ Materiales completos');

const { data: etapas } = await svc.from('proyecto_etapas').select('id').eq('proyecto_id', id);
await fetch(`${BASE}/api/proyectos/${id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ etapas: etapas.map(e => ({ id: e.id, estado: 'COMPLETADO' })) }) });
expect(await getEstado(id), 'LISTO PARA PRUEBAS', '④ Producción 100%');

await fetch(`${BASE}/api/proyectos/${id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ produccion: { progreso: 100, pruebas: true, envio: true } }) });
expect(await getEstado(id), 'COMPLETADO', '⑤ Pruebas + envío');

// Verificar que retroceder también funciona (desmarcar envío)
await fetch(`${BASE}/api/proyectos/${id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ produccion: { progreso: 100, pruebas: true, envio: false } }) });
expect(await getEstado(id), 'LISTO PARA PRUEBAS', '⑥ Desmarcar envío (retrocede)');

await svc.from('proyectos').delete().eq('id', id);

// --- RETRASADO: proyecto con fecha de entrega vencida ---
const proy2 = await (await fetch(`${BASE}/api/proyectos`, { method: 'POST', headers: H,
  body: JSON.stringify({ cliente: 'PRUEBA RETRASO SAC', monto: 10000, fecha_entrega: '2024-01-01', dias_plazo: 30 }) })).json();
const id2 = proy2.id;
expect(await getEstado(id2), 'RETRASADO', '⑦ Fecha vencida (overlay RETRASADO)');
// al completarlo, ya no es retrasado
const { data: etapas2 } = await svc.from('proyecto_etapas').select('id').eq('proyecto_id', id2);
await fetch(`${BASE}/api/proyectos/${id2}`, { method: 'PATCH', headers: H, body: JSON.stringify({
  ingenieria: { estado_planos: 'Aprobados' },
  materiales: [{ nombre: 'X', cantidad: 1, unidad: 'und', comprado: 1, estado: 'COMPLETO' }],
  etapas: etapas2.map(e => ({ id: e.id, estado: 'COMPLETADO' })),
  produccion: { progreso: 100, pruebas: true, envio: true },
}) });
expect(await getEstado(id2), 'COMPLETADO', '⑧ Completado vencido → COMPLETADO (no RETRASADO)');
await svc.from('proyectos').delete().eq('id', id2);

console.log(`\n===== ${pass} OK / ${fail} fallos ===== (limpiados ${id}, ${id2})`);
process.exit(fail ? 1 : 0);
