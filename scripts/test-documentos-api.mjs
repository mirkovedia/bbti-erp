// scripts/test-documentos-api.mjs
import { getAuthCookie, serviceClient, anonClient } from './lib/supabase-test.mjs';

const BASE = 'http://localhost:3000';
const PROYECTO = 'PR-01-2026';
let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? 'OK  ' : 'XX  ') + m); c ? pass++ : fail++; };

const adminCookie = await getAuthCookie('admin@bbti.com.pe', 'admin2024');
const comercialCookie = await getAuthCookie('jflores@bbti.com.pe', 'jflores03');
const svc = serviceClient();

// 1) Pedir URL de subida firmada
const up = await fetch(`${BASE}/api/documentos/upload-url`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', cookie: adminCookie },
  body: JSON.stringify({ proyecto_id: PROYECTO, filename: 'prueba test.txt' }),
});
const upBody = await up.json();
ok(up.status === 200 && upBody.path && upBody.token, 'upload-url devuelve path y token');

// 2) Subir un archivo a la URL firmada (cliente anon usando el token)
const content = new Blob(['contenido de prueba'], { type: 'text/plain' });
const upRes = await anonClient().storage.from('bbti-documentos')
  .uploadToSignedUrl(upBody.path, upBody.token, content);
ok(!upRes.error, 'uploadToSignedUrl sube el archivo (err: ' + (upRes.error?.message ?? '-') + ')');

// 3) Registrar metadatos
const meta = await fetch(`${BASE}/api/documentos`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', cookie: adminCookie },
  body: JSON.stringify({ proyecto_id: PROYECTO, nombre: 'prueba test.txt', tipo: 'txt', storage_path: upBody.path }),
});
const metaBody = await meta.json();
ok(meta.status === 201 && metaBody.id, 'POST metadatos devuelve 201 con id');
const docId = metaBody.id;

// 4) Listar documentos del proyecto
const list = await fetch(`${BASE}/api/documentos?proyecto_id=${PROYECTO}`, { headers: { cookie: adminCookie } });
const listBody = await list.json();
ok(list.status === 200 && Array.isArray(listBody) && listBody.some((d) => d.id === docId), 'GET lista incluye el documento');

// 5) URL de descarga firmada -> responde 200
const dl = await fetch(`${BASE}/api/documentos/download-url`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', cookie: adminCookie },
  body: JSON.stringify({ storage_path: upBody.path }),
});
const dlBody = await dl.json();
ok(dl.status === 200 && dlBody.url, 'download-url devuelve url firmada');
const fileRes = dlBody.url ? await fetch(dlBody.url) : { status: 0 };
ok(fileRes.status === 200, 'la url firmada descarga el archivo (200)');

// 6) Comercial NO puede eliminar (403)
const delC = await fetch(`${BASE}/api/documentos/${docId}`, { method: 'DELETE', headers: { cookie: comercialCookie } });
ok(delC.status === 403, 'Comercial NO puede eliminar (403)');

// 7) Admin SÍ puede eliminar
const delA = await fetch(`${BASE}/api/documentos/${docId}`, { method: 'DELETE', headers: { cookie: adminCookie } });
ok(delA.status === 200, 'Admin elimina el documento (200)');

// 8) El objeto fue borrado del Storage
const { data: rest } = await svc.storage.from('bbti-documentos').list(PROYECTO);
const sigueAhi = (rest ?? []).some((f) => upBody.path.endsWith(f.name));
ok(!sigueAhi, 'el objeto ya no está en el Storage');

// 9) La fila fue borrada
const { data: row } = await svc.from('proyecto_documentos').select('id').eq('id', docId).maybeSingle();
ok(!row, 'la fila de metadatos fue borrada');

console.log(`\n===== ${pass} OK / ${fail} fallos =====`);
process.exit(fail ? 1 : 0);
