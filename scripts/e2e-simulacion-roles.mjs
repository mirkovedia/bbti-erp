// scripts/e2e-simulacion-roles.mjs
// Simulación COMPLETA multi-usuario: los 7 usuarios demo ejercitan el ciclo de
// vida entero de un proyecto — documentos (subida/descarga/eliminación con la
// matriz de permisos), firmas de etapas por rol, pagos, notificaciones cruzadas
// y límite de tamaño. Espeja las llamadas que hace la UI real.
// Requiere: dev server en :3000, bbti-db-dev seedeada y bbti-minio-dev arriba.
import { getAuthCookie, db, BASE_URL } from './lib/test-helpers.mjs';

let ok = 0, fail = 0;
const assert = (cond, msg) => {
  if (cond) { ok++; console.log('OK ', msg); }
  else { fail++; console.log('✖  ', msg); }
};

const api = async (cookie, method, path, body) => {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try { json = await res.json(); } catch { /* respuestas sin body */ }
  return { status: res.status, json };
};

// Sube un documento como lo hace la UI (lib/utils/upload-documento.ts):
// upload-url (filename CON prefijo, igual que el nombre final) → PUT → metadatos.
const subirDoc = async (cookie, proyectoId, nombreConPrefijo, contenido) => {
  const size = Buffer.byteLength(contenido);
  const urlRes = await api(cookie, 'POST', '/api/documentos/upload-url', {
    proyecto_id: proyectoId, filename: nombreConPrefijo, content_type: 'application/pdf', size,
  });
  if (urlRes.status !== 200) return { status: urlRes.status };
  const put = await fetch(urlRes.json.url, {
    method: 'PUT', body: contenido, headers: { 'Content-Type': 'application/pdf' },
  });
  if (!put.ok) return { status: 599 };
  const meta = await api(cookie, 'POST', '/api/documentos', {
    proyecto_id: proyectoId, nombre: nombreConPrefijo, tipo: 'pdf', storage_path: urlRes.json.path,
  });
  return { status: meta.status, doc: meta.json };
};

const unread = async (cookie) => (await api(cookie, 'GET', '/api/notificaciones')).json?.unreadCount ?? -1;

let proyectoId = null;

try {
  // ── 1. Login de los 7 usuarios ────────────────────────────────────────────
  const [admin, jose, nestor, inge, logi, prod, fina] = await Promise.all([
    getAuthCookie('admin@bbti.com.pe', 'admin2024'),
    getAuthCookie('jflores@bbti.com.pe', 'jflores03'),
    getAuthCookie('normeno@bbti.com.pe', 'nestoro'),
    getAuthCookie('ingenieria@bbti.com.pe', 'goscco'),
    getAuthCookie('logistica@bbti.com.pe', 'carlosr'),
    getAuthCookie('produccion@bbti.com.pe', 'anat'),
    getAuthCookie('finanzas@bbti.com.pe', 'rosam'),
  ]);
  assert(true, '① los 7 usuarios inician sesión');

  // ── 2. Comercial (José) crea el proyecto ─────────────────────────────────
  const ingeUnreadAntes = await unread(inge);
  const crear = await api(jose, 'POST', '/api/proyectos', {
    cliente: 'Simulación Total SAC', monto: 1000, adelanto: 400, fecha_entrega: '2027-12-31',
  });
  proyectoId = crear.json?.id;
  assert(crear.status === 201 && proyectoId, `② Comercial crea proyecto (${proyectoId})`);
  assert((await unread(inge)) > ingeUnreadAntes, '③ Ingeniería recibió notificación del proyecto nuevo');

  // ── 3. Documentos: quién puede subir qué ─────────────────────────────────
  const comprobante = await subirDoc(jose, proyectoId, 'Comprobante adelanto: recibo.pdf', 'PDF-comprobante');
  assert(comprobante.status === 201, '④ Comercial sube comprobante de adelanto (prefijo → canEditComercial)');
  const oc = await subirDoc(jose, proyectoId, 'OC: orden-compra.pdf', 'PDF-oc');
  assert(oc.status === 201, '⑤ Comercial sube OC');

  const plano = await subirDoc(inge, proyectoId, 'plano-general.pdf', 'PDF-plano');
  assert(plano.status === 201, '⑥ Ingeniería sube plano (sin prefijo → canEditIngenieria)');
  const despiece = await subirDoc(inge, proyectoId, 'Plano de despiece: despiece.pdf', 'PDF-despiece');
  assert(despiece.status === 201, '⑦ Ingeniería sube plano de despiece');

  assert((await subirDoc(logi, proyectoId, 'plano-intruso.pdf', 'x')).status === 403, '⑧ Logística NO puede subir planos (403)');
  assert((await subirDoc(prod, proyectoId, 'plano-intruso.pdf', 'x')).status === 403, '⑨ Producción NO puede subir planos (403)');
  assert((await subirDoc(fina, proyectoId, 'Comprobante adelanto: falso.pdf', 'x')).status === 403, '⑩ Finanzas NO puede subir comprobantes (403)');

  // Límite de tamaño parametrizado (default 25MB): declarar 30MB → 400
  const grande = await api(jose, 'POST', '/api/documentos/upload-url', {
    proyecto_id: proyectoId, filename: 'OC: enorme.pdf', content_type: 'application/pdf', size: 30 * 1024 * 1024,
  });
  assert(grande.status === 400, '⑪ subir 30MB → 400 (límite MAX_UPLOAD_MB)');

  // ── 4. Ingeniería: aprobar plano, observación y firma ────────────────────
  const marcar = await api(inge, 'PATCH', `/api/proyectos/${proyectoId}`, {
    updateDocumento: { id: plano.doc.id, estado: 'Aprobados y firmados' },
  });
  assert(marcar.status === 200, '⑫ Ingeniería marca el plano como Aprobado y firmado');
  await api(inge, 'PATCH', `/api/proyectos/${proyectoId}`, { addObservacion: { texto: 'Plano validado en simulación' } });

  const logiUnreadAntes = await unread(logi);
  const firmaInge = await api(inge, 'PATCH', `/api/proyectos/${proyectoId}`, { confirmarEtapa: { etapa: 'ingenieria' } });
  assert(firmaInge.status === 200, '⑬ Ingeniería firma su etapa');
  assert((await unread(logi)) > logiUnreadAntes, '⑭ Logística recibió el handoff de Ingeniería');

  // ── 5. Logística: materiales y firma (y un 403 de intruso) ───────────────
  assert(
    (await api(logi, 'PATCH', `/api/proyectos/${proyectoId}`, { confirmarEtapa: { etapa: 'produccion' } })).status === 403,
    '⑮ Logística NO puede firmar Producción (403)'
  );
  const mats = await api(logi, 'PATCH', `/api/proyectos/${proyectoId}`, {
    materiales: [{ nombre: 'Interruptor ITM 2x16A', cantidad: 2, unidad: 'und', comprado: 2, estado: 'COMPLETO', precio_unitario: 50 }],
  });
  assert(mats.status === 200, '⑯ Logística registra materiales comprados');
  assert((await api(logi, 'PATCH', `/api/proyectos/${proyectoId}`, { confirmarEtapa: { etapa: 'logistica' } })).status === 200, '⑰ Logística firma su etapa');

  // ── 6. Producción: completar las 7 etapas y firmar producción + pruebas ──
  const detalle = (await api(prod, 'GET', `/api/proyectos/${proyectoId}`)).json;
  const etapas = detalle?.produccion?.etapas ?? [];
  assert(etapas.length === 7, `⑱ el proyecto tiene las 7 etapas de fabricación (${etapas.length})`);
  const completar = await api(prod, 'PATCH', `/api/proyectos/${proyectoId}`, {
    etapas: etapas.map((e) => ({ id: e.id, estado: 'COMPLETADO' })),
    produccion: { progreso: 100 },
  });
  assert(completar.status === 200, '⑲ Producción completa las 7 etapas');
  assert((await api(prod, 'PATCH', `/api/proyectos/${proyectoId}`, { confirmarEtapa: { etapa: 'produccion' } })).status === 200, '⑳ Producción firma su etapa');
  assert((await api(prod, 'PATCH', `/api/proyectos/${proyectoId}`, { confirmarEtapa: { etapa: 'pruebas' } })).status === 200, '㉑ Producción firma Pruebas');

  // ── 7. Finanzas: sin pago completo NO se cierra; con pago sí ─────────────
  const sinPago = await api(fina, 'PATCH', `/api/proyectos/${proyectoId}`, { confirmarEtapa: { etapa: 'completado' } });
  assert(sinPago.status === 409 && sinPago.json?.code === 'NOT_READY', '㉒ Completado sin pago al 100% → 409 NOT_READY');
  assert((await api(fina, 'PATCH', `/api/proyectos/${proyectoId}`, { addPago: { monto: 600, descripcion: 'Saldo final simulación' } })).status === 200, '㉓ Finanzas registra el pago del saldo (600)');
  const joseUnreadAntes = await unread(jose);
  const cerrar = await api(fina, 'PATCH', `/api/proyectos/${proyectoId}`, { confirmarEtapa: { etapa: 'completado' } });
  assert(cerrar.status === 200 && cerrar.json?.estado === 'COMPLETADO', '㉔ Finanzas firma Completado → estado COMPLETADO');
  assert((await unread(jose)) > joseUnreadAntes, '㉕ Comercial recibió la notificación de cierre');

  // ── 8. Comercial 2 comenta; todos descargan el plano ─────────────────────
  assert((await api(nestor, 'PATCH', `/api/proyectos/${proyectoId}`, { addComentario: { texto: 'Cliente conforme (simulación)' } })).status === 200, '㉖ el segundo Comercial agrega un comentario');

  const usuarios = { admin, jose, nestor, inge, logi, prod, fina };
  let descargasOk = 0;
  for (const [nombre, cookie] of Object.entries(usuarios)) {
    const dl = await api(cookie, 'POST', '/api/documentos/download-url', { storage_path: plano.doc.storage_path });
    if (dl.status === 200 && dl.json?.url) {
      const got = await fetch(dl.json.url);
      if (got.ok) descargasOk++;
      else console.log('   descarga falló para', nombre, got.status);
    } else console.log('   download-url falló para', nombre, dl.status);
  }
  assert(descargasOk === 7, `㉗ los 7 usuarios descargan el plano con URL firmada (${descargasOk}/7)`);

  // ── 9. Eliminación: solo Admin ────────────────────────────────────────────
  assert((await api(logi, 'DELETE', `/api/documentos/${despiece.doc.id}`)).status === 403, '㉘ Logística NO puede eliminar documentos (403)');
  assert((await api(admin, 'DELETE', `/api/documentos/${despiece.doc.id}`)).status === 200, '㉙ Admin elimina el plano de despiece');

  // ── 10. Bitácora de documentos registró el ciclo ─────────────────────────
  const eventos = (await api(admin, 'GET', '/api/documentos/eventos')).json ?? [];
  const delProyecto = eventos.filter((e) => e.proyecto_id === proyectoId);
  const tipos = new Set(delProyecto.map((e) => e.tipo));
  assert(tipos.has('subida') && tipos.has('descarga') && tipos.has('eliminacion'), '㉚ la bitácora registró subida, descarga y eliminación');
} catch (err) {
  fail++;
  console.log('✖ EXCEPCIÓN:', err.message);
} finally {
  // Limpieza: borrar documentos restantes vía API (borra los objetos de MinIO),
  // luego el proyecto (cascade en BD) y las bitácoras sin FK.
  if (proyectoId) {
    try {
      const admin = await getAuthCookie('admin@bbti.com.pe', 'admin2024');
      const docs = (await api(admin, 'GET', `/api/documentos?proyecto_id=${proyectoId}`)).json ?? [];
      for (const d of docs) await api(admin, 'DELETE', `/api/documentos/${d.id}`);
      await db.proyectos.delete({ where: { id: proyectoId } });
      await db.documento_eventos.deleteMany({ where: { proyecto_id: proyectoId } });
      await db.actividad_log.deleteMany({ where: { proyecto_id: proyectoId } });
      console.log(`(limpiado ${proyectoId})`);
    } catch (e) {
      console.log('(limpieza incompleta:', e.message, ')');
    }
  }
  await db.$disconnect();
  console.log(`\n===== ${ok} OK / ${fail} fallos =====`);
  process.exit(fail > 0 ? 1 : 0);
}
