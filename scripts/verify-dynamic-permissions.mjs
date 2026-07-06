// scripts/verify-dynamic-permissions.mjs
// Test del sistema de permisos dinámicos contra la API real. Requiere el server en :3000.
import { getAuthCookie, db, BASE_URL } from './lib/test-helpers.mjs';

const BASE = BASE_URL;
let pass = 0, fail = 0;
const expect = (cond, msg) => { console.log((cond ? 'OK  ' : 'XX  ') + msg); cond ? pass++ : fail++; };

async function main() {
  let pid1 = null;
  let pid3 = null;

  try {
    // 1) Obtener cookies de sesión para Admin y Comercial
    console.log('Iniciando login de prueba...');
    const cookieAdmin = await getAuthCookie('admin@bbti.com.pe', 'admin2024');
    const cookieComercial = await getAuthCookie('jflores@bbti.com.pe', 'jflores03');
    const Hadmin = { 'Content-Type': 'application/json', cookie: cookieAdmin };
    const Hcomercial = { 'Content-Type': 'application/json', cookie: cookieComercial };

    // 2) Obtener permisos actuales de Comercial para poder restaurarlos después
    const mapRes = await fetch(`${BASE}/api/role-permissions`, { headers: Hadmin });
    expect(mapRes.status === 200, '① Obtener mapa de permisos de roles → 200');
    const currentMap = await mapRes.json();
    const originalComercialPerms = currentMap['Comercial'];
    expect(!!originalComercialPerms, '① Permisos originales de Comercial leídos');

    // 3) Intentar crear proyecto como Comercial (debería funcionar por defecto: canCreate = true)
    console.log('\n② Intentando crear proyecto como Comercial (permitido por defecto)...');
    const createRes1 = await fetch(`${BASE}/api/proyectos`, {
      method: 'POST',
      headers: Hcomercial,
      body: JSON.stringify({ cliente: 'TEST PERM DINAMICO 1', monto: 15000 }),
    });
    expect(createRes1.status === 201, '② Crear proyecto inicial como Comercial → 201 (Creado)');
    const p1 = await createRes1.json();
    pid1 = p1.id;

    // 4) Admin deshabilita "canCreate" para Comercial dinámicamente
    console.log('\n③ Admin modifica permisos: deshabilita "canCreate" para Comercial...');
    const modifiedComercialPerms = { ...originalComercialPerms, canCreate: false };
    const patchRes = await fetch(`${BASE}/api/role-permissions`, {
      method: 'PATCH',
      headers: Hadmin,
      body: JSON.stringify({ rol: 'Comercial', permissions: modifiedComercialPerms }),
    });
    expect(patchRes.status === 200, '③ Guardar nuevos permisos → 200');

    // 5) Intentar crear proyecto como Comercial (debería fallar con 403)
    console.log('\n④ Intentando crear proyecto como Comercial con permiso revocado...');
    const createRes2 = await fetch(`${BASE}/api/proyectos`, {
      method: 'POST',
      headers: Hcomercial,
      body: JSON.stringify({ cliente: 'TEST PERM DINAMICO 2', monto: 15000 }),
    });
    expect(createRes2.status === 403, '④ Crear proyecto con permiso revocado → 403 Forbidden (Rechazado)');

    // 6) Restaurar permisos originales de Comercial
    console.log('\n⑤ Admin restaura los permisos originales de Comercial...');
    const restoreRes = await fetch(`${BASE}/api/role-permissions`, {
      method: 'PATCH',
      headers: Hadmin,
      body: JSON.stringify({ rol: 'Comercial', permissions: originalComercialPerms }),
    });
    expect(restoreRes.status === 200, '⑤ Restaurar permisos originales → 200');

    // 7) Volver a intentar crear proyecto como Comercial (debería volver a funcionar)
    console.log('\n⑥ Intentando crear proyecto como Comercial tras restauración...');
    const createRes3 = await fetch(`${BASE}/api/proyectos`, {
      method: 'POST',
      headers: Hcomercial,
      body: JSON.stringify({ cliente: 'TEST PERM DINAMICO 3', monto: 15000 }),
    });
    expect(createRes3.status === 201, '⑥ Crear proyecto tras restauración → 201 (Creado)');
    const p3 = await createRes3.json();
    pid3 = p3.id;

    // Limpieza de datos
    console.log('\nLimpiando proyectos de prueba de la base de datos...');
    if (pid1) { await db.proyectos.deleteMany({ where: { id: pid1 } }); await db.actividad_log.deleteMany({ where: { proyecto_id: pid1 } }); }
    if (pid3) { await db.proyectos.deleteMany({ where: { id: pid3 } }); await db.actividad_log.deleteMany({ where: { proyecto_id: pid3 } }); }
    console.log('Limpieza completada.');

  } catch (err) {
    console.error('\n✖ EXCEPCIÓN DURANTE EL TEST:', err.message);
    fail++;
  } finally {
    await db.$disconnect();
    console.log(`\n===== ${pass} OK / ${fail} fallos =====`);
    process.exit(fail ? 1 : 0);
  }
}

main();
