// scripts/e2e-seguridad.mjs
// Suite de seguridad: cabeceras HTTP, anti-CSRF por Origin, revocación de
// sesiones (cambio de clave y desactivación), política de contraseñas,
// rate-limit del login y bitácora security_log.
// Requiere: dev server en :3000 y bbti-db-dev seedeada.
import { getAuthCookie, db, BASE_URL } from './lib/test-helpers.mjs';

let ok = 0, fail = 0;
const assert = (cond, msg) => {
  if (cond) { ok++; console.log('OK ', msg); }
  else { fail++; console.log('✖  ', msg); }
};

const api = (cookie, method, path, body, headers = {}) =>
  fetch(`${BASE_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

const EMAIL_TEST = 'sec.test@bbti.com.pe';
const CLAVE_1 = 'ClaveSegura#2026a';
const CLAVE_2 = 'OtraClaveLarga#2026b';
const CLAVE_3 = 'TerceraClave#2026c';

try {
  // ── 1. Cabeceras de seguridad en todas las respuestas ─────────────────────
  const home = await fetch(`${BASE_URL}/login`);
  const csp = home.headers.get('content-security-policy') || '';
  assert(csp.includes("default-src 'self'") && csp.includes("frame-ancestors 'none'"),
    "① CSP presente con default-src 'self' y frame-ancestors 'none'");
  assert(home.headers.get('x-frame-options') === 'DENY', '② X-Frame-Options: DENY (anti-clickjacking)');
  assert(home.headers.get('x-content-type-options') === 'nosniff', '③ X-Content-Type-Options: nosniff');
  assert((home.headers.get('referrer-policy') || '').includes('strict-origin'), '④ Referrer-Policy estricta');
  assert((home.headers.get('permissions-policy') || '').includes('camera=()'), '⑤ Permissions-Policy presente');

  // ── 2. Anti-CSRF: Origin ajeno en mutación → 403 ──────────────────────────
  const evil = await api(null, 'POST', '/api/auth/login',
    { email: 'admin@bbti.com.pe', password: 'x' }, { Origin: 'https://sitio-malvado.com' });
  assert(evil.status === 403, '⑥ mutación con Origin ajeno → 403');
  const propio = await api(null, 'POST', '/api/auth/login',
    { email: 'admin@bbti.com.pe', password: 'clave-mala' }, { Origin: BASE_URL });
  assert(propio.status === 401, '⑦ mutación con Origin propio pasa el guard (401 por credenciales)');

  // ── 3. Política de contraseñas (mínimo 12) ───────────────────────────────
  const admin = await getAuthCookie('admin@bbti.com.pe', 'admin2024');
  const corta = await api(admin, 'POST', '/api/usuarios',
    { nombre: 'Sec Test', email: EMAIL_TEST, area: 'QA', rol: 'Solo Lectura', password: 'corta123' });
  assert(corta.status === 400, '⑧ crear usuario con clave corta → 400');
  const crear = await api(admin, 'POST', '/api/usuarios',
    { nombre: 'Sec Test', email: EMAIL_TEST, area: 'QA', rol: 'Solo Lectura', password: CLAVE_1 });
  assert(crear.status === 201, '⑨ crear usuario con clave de 12+ → 201');
  const testId = (await crear.json()).id;

  // ── 4. Revocación por CAMBIO DE CONTRASEÑA ───────────────────────────────
  const cookieVieja = await getAuthCookie(EMAIL_TEST, CLAVE_1);
  assert((await api(cookieVieja, 'GET', '/api/auth/me')).status === 200, '⑩ sesión del usuario de prueba activa');
  const cambio = await api(admin, 'PATCH', `/api/usuarios/${testId}`, { password: CLAVE_2 });
  assert(cambio.status === 200, '⑪ admin cambia la contraseña');
  assert((await api(cookieVieja, 'GET', '/api/auth/me')).status === 401,
    '⑫ la cookie ANTERIOR queda revocada al instante (session_version)');
  assert((await api(cookieVieja, 'GET', '/api/notificaciones')).status === 401,
    '⑬ la revocación aplica también a rutas de datos');
  const cookieNueva = await getAuthCookie(EMAIL_TEST, CLAVE_2);
  assert((await api(cookieNueva, 'GET', '/api/auth/me')).status === 200, '⑭ con la clave nueva se emite sesión válida');

  // ── 4b. Cambio de contraseña por el PROPIO usuario ───────────────────────
  assert((await api(cookieNueva, 'POST', '/api/auth/cambiar-password',
    { actual: 'incorrecta-123', nueva: CLAVE_3 })).status === 400,
    '⑭b cambio propio con actual incorrecta → 400');
  assert((await api(cookieNueva, 'POST', '/api/auth/cambiar-password',
    { actual: CLAVE_2, nueva: 'corta' })).status === 400,
    '⑭c cambio propio con nueva corta → 400');

  const cookieOtra = await getAuthCookie(EMAIL_TEST, CLAVE_2); // segunda sesión abierta
  const resCambio = await api(cookieNueva, 'POST', '/api/auth/cambiar-password',
    { actual: CLAVE_2, nueva: CLAVE_3 });
  assert(resCambio.status === 200, '⑭d cambio propio correcto → 200');
  const cookieRenovada = (resCambio.headers.get('set-cookie') || '').match(/bbti_session=[^;]+/)?.[0];
  assert(!!cookieRenovada, '⑭e el cambio devuelve una cookie renovada');
  assert((await api(cookieOtra, 'GET', '/api/auth/me')).status === 401,
    '⑭f la OTRA sesión abierta queda revocada (una cookie robada muere)');
  assert((await api(cookieRenovada, 'GET', '/api/auth/me')).status === 200,
    '⑭g la sesión que hizo el cambio SIGUE viva (cookie renovada)');
  const cookie3 = await getAuthCookie(EMAIL_TEST, CLAVE_3);
  assert((await api(cookie3, 'GET', '/api/auth/me')).status === 200, '⑭h login con la clave nueva → 200');

  // ── 5. Revocación por DESACTIVACIÓN ──────────────────────────────────────
  assert((await api(admin, 'PATCH', `/api/usuarios/${testId}`, { activo: false })).status === 200, '⑮ admin desactiva al usuario');
  assert((await api(cookie3, 'GET', '/api/notificaciones')).status === 401,
    '⑯ usuario desactivado pierde acceso al instante (no espera a que expire la cookie)');

  // ── 6. Guard anti "sistema sin admins" ───────────────────────────────────
  const adminId = (await (await api(admin, 'GET', '/api/auth/me')).json()).user.id;
  assert((await api(admin, 'PATCH', `/api/usuarios/${adminId}`, { activo: false })).status === 400,
    '⑰ un admin NO puede desactivarse a sí mismo');
  assert((await api(admin, 'PATCH', `/api/usuarios/${adminId}`, { rol: 'Solo Lectura' })).status === 400,
    '⑱ un admin NO puede quitarse su propio rol');

  // ── 7. Rate-limit + bitácora de seguridad ────────────────────────────────
  for (let i = 0; i < 6; i++) {
    await api(null, 'POST', '/api/auth/login',
      { email: 'noexiste@bbti.com.pe', password: 'x'.repeat(8) }, { 'X-Forwarded-For': '10.77.77.77' });
  }
  const bloqueado = await api(null, 'POST', '/api/auth/login',
    { email: 'noexiste@bbti.com.pe', password: 'x'.repeat(8) }, { 'X-Forwarded-For': '10.77.77.77' });
  assert(bloqueado.status === 429, '⑲ sexto intento fallido en adelante → 429');

  const eventos = await db.security_log.findMany({
    where: { created_at: { gte: new Date(Date.now() - 5 * 60_000) } },
    select: { tipo: true },
  });
  const tipos = new Set(eventos.map((e) => e.tipo));
  assert(tipos.has('login_fail') && tipos.has('login_ok') && tipos.has('login_bloqueado')
    && tipos.has('password_cambiada') && tipos.has('usuario_desactivado'),
    `⑳ security_log registró los 5 tipos de evento (${[...tipos].join(', ')})`);
} catch (err) {
  fail++;
  console.log('✖ EXCEPCIÓN:', err.message);
} finally {
  // Limpieza: usuario de prueba y sus eventos de seguridad
  await db.users.deleteMany({ where: { email: EMAIL_TEST } }).catch(() => {});
  await db.security_log.deleteMany({ where: { email: { in: [EMAIL_TEST, 'noexiste@bbti.com.pe'] } } }).catch(() => {});
  await db.$disconnect();
  console.log(`\n===== ${ok} OK / ${fail} fallos =====`);
  process.exit(fail > 0 ? 1 : 0);
}
