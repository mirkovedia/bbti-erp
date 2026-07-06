// scripts/test-documentos-api.mjs
import fs from 'fs';
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getAuthCookie, db, BASE_URL } from './lib/test-helpers.mjs';

const BASE = BASE_URL;
const PROYECTO = 'PR-01-2026';
let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? 'OK  ' : 'XX  ') + m); c ? pass++ : fail++; };

// Leer variables de entorno para S3/R2
let envContent = '';
try {
  envContent = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
} catch {
  try {
    envContent = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8');
  } catch {}
}
const getEnv = (k) => (envContent.match(new RegExp('^' + k + '=(.*)$', 'm'))?.[1] || process.env[k] || '').trim();

const bucket = getEnv('R2_BUCKET');
const r2Client = new S3Client({
  region: getEnv('R2_REGION') || 'auto',
  endpoint: getEnv('R2_ENDPOINT_URL'),
  credentials: {
    accessKeyId: getEnv('R2_ACCESS_KEY_ID'),
    secretAccessKey: getEnv('R2_SECRET_ACCESS_KEY'),
  },
  forcePathStyle: getEnv('R2_FORCE_PATH_STYLE') === 'true',
});

async function main() {
  try {
    const adminCookie = await getAuthCookie('admin@bbti.com.pe', 'admin2024');
    const comercialCookie = await getAuthCookie('jflores@bbti.com.pe', 'jflores03');

    // 1) Pedir URL de subida firmada
    const up = await fetch(`${BASE}/api/documentos/upload-url`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', cookie: adminCookie },
      body: JSON.stringify({ proyecto_id: PROYECTO, filename: 'prueba test.txt', content_type: 'text/plain', size: 19 }),
    });
    const upBody = await up.json();
    ok(up.status === 200 && upBody.path && upBody.url, 'upload-url devuelve path y url');

    // 2) Subir un archivo a la URL firmada (cliente anon usando PUT directo)
    const upRes = await fetch(upBody.url, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain' },
      body: 'contenido de prueba'
    });
    ok(upRes.status === 200, 'upload a URL firmada sube el archivo (status 200)');

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

    // 8) El objeto fue borrado del Storage (usamos HeadObjectCommand directo en el bucket)
    let sigueAhi = true;
    try {
      await r2Client.send(new HeadObjectCommand({ Bucket: bucket, Key: upBody.path }));
      sigueAhi = true;
    } catch (err) {
      if (err.name === 'NotFound') sigueAhi = false;
    }
    ok(!sigueAhi, 'el objeto ya no está en el Storage');

    // 9) La fila fue borrada
    const row = await db.proyecto_documentos.findFirst({ where: { id: docId } });
    ok(!row, 'la fila de metadatos fue borrada');

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
