// E2E del flujo de confirmaciones contra la API real. Requiere el server en :3000.
import { getAuthCookie, serviceClient } from './lib/supabase-test.mjs';
const BASE = 'http://localhost:3000';
const cookie = await getAuthCookie('admin@bbti.com.pe', 'admin2024');
const svc = serviceClient();
const H = { 'Content-Type': 'application/json', cookie };
let pass = 0, fail = 0;
const expect = (cond, msg) => { console.log((cond ? 'OK  ' : 'XX  ') + msg); cond ? pass++ : fail++; };
const getEstado = async (id) => (await (await fetch(`${BASE}/api/proyectos/${id}`, { headers: { cookie } })).json()).estado;
const confirmar = (id, etapa) => fetch(`${BASE}/api/proyectos/${id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ confirmarEtapa: { etapa } }) });
const deshacer = (id, etapa) => fetch(`${BASE}/api/proyectos/${id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ deshacerEtapa: { etapa } }) });

// Crear proyecto
const proy = await (await fetch(`${BASE}/api/proyectos`, { method: 'POST', headers: H,
  body: JSON.stringify({ cliente: 'PRUEBA SIGNOFF SAC', monto: 50000, fecha_entrega: '2026-12-31', dias_plazo: 60, adelanto: 15000 }) })).json();
const id = proy.id;
expect(proy.estado === 'EN INGENIERÍA', '① crear → EN INGENIERÍA');

// ② Confirmar Logística antes que Ingeniería → 409
const r1 = await confirmar(id, 'logistica');
expect(r1.status === 409, '② confirmar logística sin ingeniería → 409');

// ③ Aprobar plano + confirmar Ingeniería
await svc.from('proyecto_documentos').insert({ proyecto_id: id, nombre: 'plano_v1.pdf', estado: 'Aprobados y firmados' });
const r2 = await confirmar(id, 'ingenieria');
expect(r2.status === 200, '③ confirmar ingeniería → 200');
expect(await getEstado(id) === 'COMPRAS EN CURSO', '③ estado → COMPRAS EN CURSO');

// ④ Materiales COMPLETO + confirmar Logística
await fetch(`${BASE}/api/proyectos/${id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ materiales: [
  { nombre: 'Interruptor', cantidad: 5, unidad: 'und', comprado: 5, estado: 'COMPLETO' } ] }) });
await confirmar(id, 'logistica');
expect(await getEstado(id) === 'EN PRODUCCIÓN', '④ logística firmada → EN PRODUCCIÓN');

// ⑤ Etapas COMPLETADO + confirmar Producción
const { data: etapas } = await svc.from('proyecto_etapas').select('id').eq('proyecto_id', id);
await fetch(`${BASE}/api/proyectos/${id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ etapas: etapas.map(e => ({ id: e.id, estado: 'COMPLETADO' })) }) });
await confirmar(id, 'produccion');
expect(await getEstado(id) === 'LISTO PARA PRUEBAS', '⑤ producción firmada → LISTO PARA PRUEBAS');

// ⑥ Pruebas + Completado
await confirmar(id, 'pruebas');
await confirmar(id, 'completado');
expect(await getEstado(id) === 'COMPLETADO', '⑥ completado firmado → COMPLETADO');

// ⑦ Deshacer Logística (cascada) → vuelve a COMPRAS EN CURSO
await deshacer(id, 'logistica');
expect(await getEstado(id) === 'COMPRAS EN CURSO', '⑦ deshacer logística (cascada) → COMPRAS EN CURSO');
const { data: restantes } = await svc.from('proyecto_confirmaciones').select('etapa').eq('proyecto_id', id);
expect(restantes.length === 1 && restantes[0].etapa === 'ingenieria', '⑦ solo queda ingeniería firmada');

// ⑧ Permisos: rol Logística NO puede confirmar Producción
//   (rehacer logística como admin, luego intentar producción con cookie de logística)
await confirmar(id, 'logistica');
const cookieLog = await getAuthCookie('logistica@bbti.com.pe', 'carlosr');
const r8 = await fetch(`${BASE}/api/proyectos/${id}`, { method: 'PATCH',
  headers: { 'Content-Type': 'application/json', cookie: cookieLog },
  body: JSON.stringify({ confirmarEtapa: { etapa: 'produccion' } }) });
expect(r8.status === 403, '⑧ rol Logística confirma Producción → 403');

// Limpieza
await svc.from('proyectos').delete().eq('id', id);
console.log(`\n===== ${pass} OK / ${fail} fallos ===== (limpiado ${id})`);
process.exit(fail ? 1 : 0);
