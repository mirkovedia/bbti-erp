// E2E de notificaciones contra la API real. Requiere el server en :3000.
import { getAuthCookie, serviceClient } from './lib/supabase-test.mjs';
const BASE = 'http://localhost:3000';
const svc = serviceClient();
const cookieAdmin = await getAuthCookie('admin@bbti.com.pe', 'admin2024');
const cookieLog = await getAuthCookie('logistica@bbti.com.pe', 'carlosr');
const Hadmin = { 'Content-Type': 'application/json', cookie: cookieAdmin };
const Hlog = { 'Content-Type': 'application/json', cookie: cookieLog };
let pass = 0, fail = 0;
const expect = (cond, msg) => { console.log((cond ? 'OK  ' : 'XX  ') + msg); cond ? pass++ : fail++; };

const { data: logUser } = await svc.from('users').select('id').eq('email', 'logistica@bbti.com.pe').single();
const countLog = async () => (await svc.from('notificaciones').select('id', { count: 'exact', head: true }).eq('destinatario_id', logUser.id)).count ?? 0;

// ① Crear proyecto → notificación hito para Ingeniería
const proy = await (await fetch(`${BASE}/api/proyectos`, { method: 'POST', headers: Hadmin,
  body: JSON.stringify({ cliente: 'PRUEBA NOTIF SAC', monto: 30000, fecha_entrega: '2026-12-31', dias_plazo: 60, adelanto: 9000 }) })).json();
const id = proy.id;
const { data: ingUser } = await svc.from('users').select('id').eq('email', 'ingenieria@bbti.com.pe').single();
const { count: hitoCount } = await svc.from('notificaciones').select('id', { count: 'exact', head: true }).eq('proyecto_id', id).eq('destinatario_id', ingUser.id).eq('tipo', 'hito');
expect((hitoCount ?? 0) >= 1, '① crear proyecto → Ingeniería recibe hito');

// ② Aprobar plano + confirmar Ingeniería (admin) → Logística recibe confirmación
await svc.from('proyecto_documentos').insert({ proyecto_id: id, nombre: 'plano.pdf', estado: 'Aprobados y firmados' });
const logAntes = await countLog();
await fetch(`${BASE}/api/proyectos/${id}`, { method: 'PATCH', headers: Hadmin, body: JSON.stringify({ confirmarEtapa: { etapa: 'ingenieria' } }) });
expect(await countLog() === logAntes + 1, '② confirmar Ingeniería → Logística +1 notificación');

// ③ GET /api/notificaciones como Logística lista la confirmación
const notifLog = await (await fetch(`${BASE}/api/notificaciones`, { headers: { cookie: cookieLog } })).json();
expect(notifLog.items.some(n => n.proyecto_id === id && n.tipo === 'confirmacion'), '③ GET notificaciones (Logística) trae la confirmación');
expect(notifLog.unreadCount >= 1, '③ unreadCount ≥ 1');

// ④ Exclusión del actor: Logística confirma logística y luego LA DESHACE → no se auto-notifica
await fetch(`${BASE}/api/proyectos/${id}`, { method: 'PATCH', headers: Hadmin, body: JSON.stringify({ materiales: [
  { nombre: 'X', cantidad: 1, unidad: 'und', comprado: 1, estado: 'COMPLETO' } ] }) });
await fetch(`${BASE}/api/proyectos/${id}`, { method: 'PATCH', headers: Hlog, body: JSON.stringify({ confirmarEtapa: { etapa: 'logistica' } }) });
const antesDeshacer = await countLog();
await fetch(`${BASE}/api/proyectos/${id}`, { method: 'PATCH', headers: Hlog, body: JSON.stringify({ deshacerEtapa: { etapa: 'logistica' } }) });
expect(await countLog() === antesDeshacer, '④ Logística deshace su etapa → NO se auto-notifica (actor excluido)');

// ⑤ Marcar leídas como Logística → unreadCount 0
await fetch(`${BASE}/api/notificaciones/marcar-leidas`, { method: 'POST', headers: Hlog, body: '{}' });
const trasLeer = await (await fetch(`${BASE}/api/notificaciones`, { headers: { cookie: cookieLog } })).json();
expect(trasLeer.unreadCount === 0, '⑤ marcar-leidas → unreadCount 0');

// Limpieza (cascada borra notificaciones)
await svc.from('proyectos').delete().eq('id', id);
console.log(`\n===== ${pass} OK / ${fail} fallos ===== (limpiado ${id})`);
process.exit(fail ? 1 : 0);
