// E2E del flujo de confirmaciones contra la API real. Requiere el server en :3000.
import { getAuthCookie, db, BASE_URL } from './lib/test-helpers.mjs';
const BASE = BASE_URL;
const cookie = await getAuthCookie('admin@bbti.com.pe', 'admin2024');
const H = { 'Content-Type': 'application/json', cookie };
let pass = 0, fail = 0;
const expect = (cond, msg) => { console.log((cond ? 'OK  ' : 'XX  ') + msg); cond ? pass++ : fail++; };
const getEstado = async (id) => (await (await fetch(`${BASE}/api/proyectos/${id}`, { headers: { cookie } })).json()).estado;
const confirmar = (id, etapa) => fetch(`${BASE}/api/proyectos/${id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ confirmarEtapa: { etapa } }) });
const deshacer = (id, etapa) => fetch(`${BASE}/api/proyectos/${id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ deshacerEtapa: { etapa } }) });

async function main() {
  try {
    // Crear proyecto
    const proy = await (await fetch(`${BASE}/api/proyectos`, { method: 'POST', headers: H,
      body: JSON.stringify({ cliente: 'PRUEBA SIGNOFF SAC', monto: 50000, fecha_entrega: '2026-12-31', dias_plazo: 60, adelanto: 15000 }) })).json();
    const id = proy.id;
    expect(proy.estado === 'EN INGENIERÍA', '① crear → EN INGENIERÍA');

    // ② Confirmar Logística antes que Ingeniería → 409
    const r1 = await confirmar(id, 'logistica');
    expect(r1.status === 409, '② confirmar logística sin ingeniería → 409');

    // ③ Aprobar plano + confirmar Ingeniería
    await db.proyecto_documentos.create({ data: { proyecto_id: id, nombre: 'plano_v1.pdf', estado: 'Aprobados y firmados' } });
    const r2 = await confirmar(id, 'ingenieria');
    expect(r2.status === 200, '③ confirmar ingeniería → 200');
    expect(await getEstado(id) === 'COMPRAS EN CURSO', '③ estado → COMPRAS EN CURSO');

    // ④ Materiales COMPLETO + confirmar Logística
    await fetch(`${BASE}/api/proyectos/${id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ materiales: [
      { nombre: 'Interruptor', cantidad: 5, unidad: 'und', comprado: 5, estado: 'COMPLETO' } ] }) });
    await confirmar(id, 'logistica');
    expect(await getEstado(id) === 'EN PRODUCCIÓN', '④ logística firmada → EN PRODUCCIÓN');

    // ⑤ Etapas COMPLETADO + confirmar Producción
    const etapas = await db.proyecto_etapas.findMany({ where: { proyecto_id: id }, select: { id: true } });
    await fetch(`${BASE}/api/proyectos/${id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ etapas: etapas.map(e => ({ id: e.id, estado: 'COMPLETADO' })) }) });
    await confirmar(id, 'produccion');
    expect(await getEstado(id) === 'LISTO PARA PRUEBAS', '⑤ producción firmada → LISTO PARA PRUEBAS');

    // ⑥ Pruebas + Completado. "Completado" exige pago al 100% y también la firma Finanzas.
    await confirmar(id, 'pruebas');
    const rSinPago = await confirmar(id, 'completado');
    expect(rSinPago.status === 409, '⑥ completado sin pago total → 409 NOT_READY');
    const cookieFin = await getAuthCookie('finanzas@bbti.com.pe', 'rosam');
    const HFin = { 'Content-Type': 'application/json', cookie: cookieFin };
    await fetch(`${BASE}/api/proyectos/${id}`, { method: 'PATCH', headers: HFin,
      body: JSON.stringify({ addPago: { monto: 35000, descripcion: 'saldo final' } }) });
    const rFin = await fetch(`${BASE}/api/proyectos/${id}`, { method: 'PATCH', headers: HFin,
      body: JSON.stringify({ confirmarEtapa: { etapa: 'completado' } }) });
    expect(rFin.status === 200, `⑥ Finanzas paga el saldo y firma completado → 200 (${rFin.status})`);
    expect(await getEstado(id) === 'COMPLETADO', '⑥ completado firmado → COMPLETADO');

    // ⑦ Deshacer Logística (cascada) → vuelve a COMPRAS EN CURSO
    await deshacer(id, 'logistica');
    expect(await getEstado(id) === 'COMPRAS EN CURSO', '⑦ deshacer logística (cascada) → COMPRAS EN CURSO');
    const restantes = await db.proyecto_confirmaciones.findMany({ where: { proyecto_id: id }, select: { etapa: true } });
    expect(restantes.length === 1 && restantes[0].etapa === 'ingenieria', '⑦ solo queda ingeniería firmada');

    // ⑧ Permisos: un rol SIN canEditProduccion no puede confirmar Producción.
    await confirmar(id, 'logistica');
    const CANDIDATOS_403 = [
      { email: 'jflores@bbti.com.pe', pass: 'jflores03', rol: 'Comercial' },
      { email: 'ingenieria@bbti.com.pe', pass: 'goscco', rol: 'Ingeniería' },
      { email: 'logistica@bbti.com.pe', pass: 'carlosr', rol: 'Logística' },
    ];
    const permRows = await db.role_permissions.findMany({ select: { rol: true, permissions: true } });
    const permsDe = (rol) => permRows?.find((r) => r.rol === rol)?.permissions ?? {};
    const negado = CANDIDATOS_403.find((c) => !permsDe(c.rol).canEditProduccion);
    if (negado) {
      const cookieNeg = await getAuthCookie(negado.email, negado.pass);
      const r8 = await fetch(`${BASE}/api/proyectos/${id}`, { method: 'PATCH',
        headers: { 'Content-Type': 'application/json', cookie: cookieNeg },
        body: JSON.stringify({ confirmarEtapa: { etapa: 'produccion' } }) });
      expect(r8.status === 403, `⑧ rol ${negado.rol} confirma Producción → 403`);
    } else {
      console.log('⚠ todos los roles candidatos tienen canEditProduccion — test ⑧ omitido');
    }

    // Limpieza
    await db.proyectos.deleteMany({ where: { id } });
    await db.actividad_log.deleteMany({ where: { proyecto_id: id } });
    console.log(`\n===== ${pass} OK / ${fail} fallos ===== (limpiado ${id})`);
  } catch (err) {
    console.error('Error durante la ejecución del test:', err);
    fail++;
  } finally {
    await db.$disconnect();
    process.exit(fail ? 1 : 0);
  }
}

main();
