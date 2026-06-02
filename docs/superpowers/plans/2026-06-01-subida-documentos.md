# Subida de Documentos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir subir, listar, descargar y eliminar documentos por proyecto desde la pestaña Ingeniería, usando URLs de subida firmadas.

**Architecture:** El navegador pide a la API una URL de subida firmada (generada con service role), sube el archivo directo al Storage de Supabase, y luego registra los metadatos vía API. Descarga y borrado también pasan por la API con service role. Sin políticas RLS de Storage.

**Tech Stack:** Next.js 16 (App Router, route handlers), Supabase Storage + Postgres, `@supabase/ssr` (browser) y `@supabase/supabase-js` (admin), Playwright para E2E.

**Spec:** `docs/superpowers/specs/2026-06-01-subida-documentos-design.md`

---

## Notas previas (toda persona que ejecute esto debe leer)

- **El servidor de dev debe estar corriendo** en `http://localhost:3000` para los tests de integración. Iniciar con `npm run dev` (un solo proceso; si dice "Port 3000 in use" ya hay uno).
- **No nombrar variables `URL`** en scripts Node: pisa la clase global y rompe `@supabase/supabase-js` con "Invalid supabaseUrl".
- Usuarios de prueba: `admin@bbti.com.pe` / `admin2024` (Administrador), `jflores@bbti.com.pe` / `jflores03` (Comercial, NO admin).
- Proyecto de prueba existente: `PR-01-2026`.
- Los route handlers de Next 16 reciben `params` como `Promise` — siempre `const { id } = await params;`.

## File Structure

| Archivo | Responsabilidad | Acción |
|---|---|---|
| `lib/constants.ts` | Nombre del bucket + tamaño máximo | Crear |
| `scripts/lib/supabase-test.mjs` | Helper de tests: cookie de auth + cliente service | Crear |
| `scripts/setup-storage.mjs` | Crea el bucket (idempotente) | Crear |
| `types/index.ts` | Tipo `Documento` + `Proyecto.documentos` | Modificar |
| `app/api/documentos/route.ts` | GET (lista, filtro) + POST (metadatos) | Modificar |
| `app/api/documentos/upload-url/route.ts` | POST: URL firmada de subida | Crear |
| `app/api/documentos/download-url/route.ts` | POST: URL firmada de descarga | Crear |
| `app/api/documentos/[id]/route.ts` | DELETE: borra objeto + fila (Admin) | Crear |
| `app/api/proyectos/[id]/route.ts` | GET incluye `documentos` | Modificar |
| `app/(dashboard)/documentos/page.tsx` | Descarga usa `/download-url` | Modificar |
| `components/proyectos/tabs/TabIngenieria.tsx` | Sección Documentos (subir/listar/descargar/eliminar) | Modificar |
| `scripts/test-documentos-api.mjs` | Test de integración de la API | Crear |
| `scripts/e2e-documentos.mjs` | E2E Playwright del flujo UI | Crear |

---

## Task 1: Constantes compartidas

**Files:**
- Create: `lib/constants.ts`

- [ ] **Step 1: Crear el archivo de constantes**

```ts
// lib/constants.ts
export const DOCUMENTOS_BUCKET = 'bbti-documentos';
export const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB en bytes
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: exit 0 (sin errores)

- [ ] **Step 3: Commit**

```bash
git add lib/constants.ts
git commit -m "feat: añade constantes de documentos (bucket y tamaño máximo)"
```

---

## Task 2: Helper de tests + bucket de Storage

**Files:**
- Create: `scripts/lib/supabase-test.mjs`
- Create: `scripts/setup-storage.mjs`

- [ ] **Step 1: Crear el helper de tests**

```js
// scripts/lib/supabase-test.mjs
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync(new URL('../../.env.local', import.meta.url), 'utf8');
const get = (k) => {
  const m = env.match(new RegExp('^' + k + '=(.*)$', 'm'));
  return m ? m[1].trim().replace(/\r/g, '') : '';
};

export const SUPA_URL = get('NEXT_PUBLIC_SUPABASE_URL');
const ANON = get('NEXT_PUBLIC_SUPABASE_ANON_KEY');
const SERVICE = get('SUPABASE_SERVICE_ROLE_KEY');
const REF = SUPA_URL.match(/https:\/\/([^.]+)\./)[1];

export const anonClient = () => createClient(SUPA_URL, ANON, { auth: { persistSession: false } });
export const serviceClient = () => createClient(SUPA_URL, SERVICE, { auth: { persistSession: false } });

// Devuelve el header Cookie que el navegador enviaría para una sesión @supabase/ssr
export async function getAuthCookie(email, password) {
  const sb = anonClient();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error('login: ' + error.message);
  const s = data.session;
  const val = 'base64-' + Buffer.from(JSON.stringify({
    access_token: s.access_token, token_type: 'bearer', expires_in: s.expires_in,
    expires_at: s.expires_at, refresh_token: s.refresh_token, user: s.user,
  })).toString('base64');
  const name = 'sb-' + REF + '-auth-token';
  if (val.length > 3180) {
    const chunks = [];
    for (let i = 0, n = 0; i < val.length; i += 3180, n++) chunks.push(name + '.' + n + '=' + val.slice(i, i + 3180));
    return chunks.join('; ');
  }
  return name + '=' + val;
}
```

- [ ] **Step 2: Crear el script de setup del bucket**

```js
// scripts/setup-storage.mjs
import { serviceClient } from './lib/supabase-test.mjs';

const BUCKET = 'bbti-documentos';
const admin = serviceClient();

const { data: buckets, error: le } = await admin.storage.listBuckets();
if (le) { console.error('✗ listBuckets:', le.message); process.exit(1); }

if (buckets?.some((b) => b.id === BUCKET)) {
  console.log(`✓ Bucket ${BUCKET} ya existe`);
} else {
  const { error } = await admin.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: 26214400, // 25 MB
  });
  if (error) { console.error('✗ createBucket:', error.message); process.exit(1); }
  console.log(`✓ Bucket ${BUCKET} creado (privado, límite 25MB)`);
}
```

- [ ] **Step 3: Ejecutar el setup del bucket**

Run: `node scripts/setup-storage.mjs`
Expected: `✓ Bucket bbti-documentos creado (privado, límite 25MB)`

- [ ] **Step 4: Verificar idempotencia (correr de nuevo)**

Run: `node scripts/setup-storage.mjs`
Expected: `✓ Bucket bbti-documentos ya existe`

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/supabase-test.mjs scripts/setup-storage.mjs
git commit -m "feat: helper de tests y script de creación del bucket de Storage"
```

---

## Task 3: Tipo Documento

**Files:**
- Modify: `types/index.ts`

- [ ] **Step 1: Añadir el tipo `Documento` después de `Comentario`**

En `types/index.ts`, tras la interfaz `Comentario` (línea ~68), insertar:

```ts
export interface Documento {
  id: string;
  proyecto_id: string;
  nombre: string;
  tipo: string | null;
  storage_path: string | null;
  subido_por: string | null;
  created_at: string;
}
```

- [ ] **Step 2: Añadir `documentos` a la interfaz `Proyecto`**

Dentro de `interface Proyecto`, justo antes del cierre `}` (después del bloque `finanzas?`), añadir:

```ts
  documentos?: Documento[];
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: exit 0

- [ ] **Step 4: Commit**

```bash
git add types/index.ts
git commit -m "feat: tipo Documento y Proyecto.documentos"
```

---

## Task 4: API de documentos (endpoints)

**Files:**
- Modify: `app/api/documentos/route.ts`
- Create: `app/api/documentos/upload-url/route.ts`
- Create: `app/api/documentos/download-url/route.ts`
- Create: `app/api/documentos/[id]/route.ts`
- Test: `scripts/test-documentos-api.mjs`

- [ ] **Step 1: Escribir el test de integración (falla primero)**

```js
// scripts/test-documentos-api.mjs
import { getAuthCookie, serviceClient } from './lib/supabase-test.mjs';

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
const { anonClient } = await import('./lib/supabase-test.mjs');
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
ok(list.status === 200 && listBody.some((d) => d.id === docId), 'GET lista incluye el documento');

// 5) URL de descarga firmada -> responde 200
const dl = await fetch(`${BASE}/api/documentos/download-url`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', cookie: adminCookie },
  body: JSON.stringify({ storage_path: upBody.path }),
});
const dlBody = await dl.json();
ok(dl.status === 200 && dlBody.url, 'download-url devuelve url firmada');
const fileRes = await fetch(dlBody.url);
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
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `node scripts/test-documentos-api.mjs`
Expected: FALLA — los endpoints `/upload-url`, `/download-url`, `DELETE /[id]` aún no existen (404), y el POST raíz todavía genera URL firmada en vez de insertar metadatos.

- [ ] **Step 3: Reescribir `app/api/documentos/route.ts` (GET con filtro + POST metadatos)**

```ts
// app/api/documentos/route.ts
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// GET: lista documentos (filtro opcional ?proyecto_id=)
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const proyectoId = new URL(request.url).searchParams.get('proyecto_id');
    let query = supabase
      .from('proyecto_documentos')
      .select('*, proyectos(cliente)')
      .order('created_at', { ascending: false });
    if (proyectoId) query = query.eq('proyecto_id', proyectoId);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const docs = (data ?? []).map((d) => ({
      id: d.id,
      proyecto_id: d.proyecto_id,
      cliente: d.proyectos?.cliente ?? '',
      nombre: d.nombre,
      tipo: d.tipo,
      storage_path: d.storage_path,
      subido_por: d.subido_por,
      created_at: d.created_at,
    }));
    return NextResponse.json(docs);
  } catch (err) {
    console.error('GET /api/documentos error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

// POST: registra los metadatos de un documento ya subido al Storage
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const { proyecto_id, nombre, tipo, storage_path } = await request.json();
    if (!proyecto_id || !nombre || !storage_path) {
      return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 });
    }

    const { data: userData } = await supabase
      .from('users').select('nombre').eq('id', user.id).single();

    const { data, error } = await supabase
      .from('proyecto_documentos')
      .insert({
        proyecto_id,
        nombre,
        tipo: tipo ?? null,
        storage_path,
        subido_por: userData?.nombre ?? 'Sistema',
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error('POST /api/documentos error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Crear `app/api/documentos/upload-url/route.ts`**

```ts
// app/api/documentos/upload-url/route.ts
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { DOCUMENTOS_BUCKET } from '@/lib/constants';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const { proyecto_id, filename } = await request.json();
    if (!proyecto_id || !filename) {
      return NextResponse.json({ error: 'proyecto_id y filename requeridos' }, { status: 400 });
    }

    const { data: proyecto } = await supabase
      .from('proyectos').select('id').eq('id', proyecto_id).maybeSingle();
    if (!proyecto) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });

    const safe = String(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${proyecto_id}/${crypto.randomUUID()}-${safe}`;

    const admin = createAdminClient();
    const { data, error } = await admin.storage
      .from(DOCUMENTOS_BUCKET)
      .createSignedUploadUrl(path);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ path: data.path, token: data.token, signedUrl: data.signedUrl });
  } catch (err) {
    console.error('POST /api/documentos/upload-url error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
```

- [ ] **Step 5: Crear `app/api/documentos/download-url/route.ts`**

```ts
// app/api/documentos/download-url/route.ts
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { DOCUMENTOS_BUCKET } from '@/lib/constants';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const { storage_path } = await request.json();
    if (!storage_path || typeof storage_path !== 'string') {
      return NextResponse.json({ error: 'storage_path requerido' }, { status: 400 });
    }
    const { data: doc } = await supabase
      .from('proyecto_documentos').select('id').eq('storage_path', storage_path).maybeSingle();
    if (!doc) return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 });

    const admin = createAdminClient();
    const { data, error } = await admin.storage
      .from(DOCUMENTOS_BUCKET).createSignedUrl(storage_path, 3600);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ url: data.signedUrl });
  } catch (err) {
    console.error('POST /api/documentos/download-url error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
```

- [ ] **Step 6: Crear `app/api/documentos/[id]/route.ts`**

```ts
// app/api/documentos/[id]/route.ts
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { DOCUMENTOS_BUCKET } from '@/lib/constants';
import { NextResponse } from 'next/server';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const { data: userData } = await supabase
      .from('users').select('rol').eq('id', user.id).single();
    if (userData?.rol !== 'Administrador') {
      return NextResponse.json({ error: 'Solo administradores pueden eliminar documentos' }, { status: 403 });
    }

    const { data: doc } = await supabase
      .from('proyecto_documentos').select('storage_path').eq('id', id).maybeSingle();
    if (!doc) return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 });

    const admin = createAdminClient();
    if (doc.storage_path) {
      await admin.storage.from(DOCUMENTOS_BUCKET).remove([doc.storage_path]);
    }
    const { error } = await admin.from('proyecto_documentos').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/documentos/[id] error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
```

- [ ] **Step 7: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: exit 0

- [ ] **Step 8: Correr el test de integración (debe pasar)**

Asegurar que el dev server corre en :3000. Run: `node scripts/test-documentos-api.mjs`
Expected: `===== 9 OK / 0 fallos =====`

- [ ] **Step 9: Commit**

```bash
git add app/api/documentos scripts/test-documentos-api.mjs
git commit -m "feat: API de documentos (upload-url, metadatos, download-url, delete)"
```

---

## Task 5: El detalle de proyecto incluye documentos

**Files:**
- Modify: `app/api/proyectos/[id]/route.ts` (GET, líneas 25-58)

- [ ] **Step 1: Añadir `proyecto_documentos` al `Promise.all`**

En el array desestructurado (línea 25), añadir `documentos` al inicio de los nombres y la query correspondiente al final del array:

Cambiar la línea 25 de:
```ts
    const [comercial, ingenieria, materiales, produccion, etapas, finanzas, pagos, comentarios, observaciones] = await Promise.all([
```
a:
```ts
    const [comercial, ingenieria, materiales, produccion, etapas, finanzas, pagos, comentarios, observaciones, documentos] = await Promise.all([
```

Y añadir esta query como último elemento del array (tras la query de `proyecto_observaciones`, antes del `]);`):
```ts
      supabase.from('proyecto_documentos').select('*').eq('proyecto_id', id).order('created_at', { ascending: false }),
```

- [ ] **Step 2: Añadir `documentos` al objeto `fullProyecto`**

Tras la línea de `finanzas: ...` y antes del cierre `};` del objeto `fullProyecto`, añadir:
```ts
      documentos: documentos.data || [],
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: exit 0

- [ ] **Step 4: Verificar que el GET devuelve `documentos` (array)**

```bash
node -e '
import("./scripts/lib/supabase-test.mjs").then(async (m) => {
  const cookie = await m.getAuthCookie("admin@bbti.com.pe", "admin2024");
  const r = await fetch("http://localhost:3000/api/proyectos/PR-01-2026", { headers: { cookie } });
  const j = await r.json();
  console.log("documentos es array:", Array.isArray(j.documentos));
});'
```
Expected: `documentos es array: true`

- [ ] **Step 5: Commit**

```bash
git add app/api/proyectos/[id]/route.ts
git commit -m "feat: el detalle de proyecto incluye sus documentos"
```

---

## Task 6: La página /documentos usa /download-url

**Files:**
- Modify: `app/(dashboard)/documentos/page.tsx` (función `handleDownload`, ~línea 59-72)

- [ ] **Step 1: Cambiar la URL del fetch de descarga**

En `handleDownload`, cambiar:
```ts
      const res = await fetch('/api/documentos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storage_path: doc.storage_path }),
      });
```
a:
```ts
      const res = await fetch('/api/documentos/download-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storage_path: doc.storage_path }),
      });
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: exit 0

- [ ] **Step 3: Commit**

```bash
git add "app/(dashboard)/documentos/page.tsx"
git commit -m "refactor: la página de documentos usa el endpoint download-url"
```

---

## Task 7: Sección Documentos en la pestaña Ingeniería

**Files:**
- Modify: `components/proyectos/tabs/TabIngenieria.tsx`

- [ ] **Step 1: Actualizar imports y tipo**

Reemplazar las líneas 1-7 (imports) por:
```tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { Save, FileCheck, AlertCircle, Upload, Download, Trash2, File, Loader2 } from 'lucide-react';
import { Proyecto, Documento } from '@/types';
import { useAppStore } from '@/store/appStore';
import { can } from '@/lib/auth/permissions';
import { createClient } from '@/lib/supabase/client';
import { DOCUMENTOS_BUCKET, MAX_FILE_SIZE } from '@/lib/constants';
```

- [ ] **Step 2: Añadir estado y handlers de documentos**

Tras el bloque `handleObservacion` (después de su `};`, ~línea 78), insertar:

```tsx
  // ---- Documentos ----
  const documentos: Documento[] = proyecto.documentos || [];
  const canDelete = user?.rol === 'Administrador';
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleUpload = async (file: File) => {
    setUploadError('');
    if (file.size > MAX_FILE_SIZE) {
      setUploadError('El archivo supera el límite de 25MB.');
      return;
    }
    setUploading(true);
    try {
      // 1) Pedir URL de subida firmada
      const urlRes = await fetch('/api/documentos/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proyecto_id: proyecto.id, filename: file.name }),
      });
      if (!urlRes.ok) throw new Error('No se pudo iniciar la subida');
      const { path, token } = await urlRes.json();

      // 2) Subir el archivo directo al Storage
      const supabase = createClient();
      const { error: upErr } = await supabase.storage
        .from(DOCUMENTOS_BUCKET)
        .uploadToSignedUrl(path, token, file);
      if (upErr) throw new Error(upErr.message);

      // 3) Registrar metadatos
      const tipo = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : null;
      const metaRes = await fetch('/api/documentos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proyecto_id: proyecto.id, nombre: file.name, tipo, storage_path: path }),
      });
      if (!metaRes.ok) throw new Error('No se pudo registrar el documento');

      await refetch();
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Error al subir');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDownload = async (doc: Documento) => {
    if (!doc.storage_path) return;
    const res = await fetch('/api/documentos/download-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storage_path: doc.storage_path }),
    });
    if (res.ok) {
      const { url } = await res.json();
      window.open(url, '_blank');
    }
  };

  const handleDeleteDoc = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/documentos/${id}`, { method: 'DELETE' });
      if (res.ok) await refetch();
    } finally {
      setDeletingId(null);
    }
  };
```

- [ ] **Step 3: Añadir la UI de Documentos**

Justo antes del cierre del `</div>` raíz del componente (la última línea `    </div>` antes de `  );`), insertar el bloque:

```tsx
      {/* Documentos */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
          <File className="w-5 h-5 text-blue-400" />
          Documentos ({documentos.length})
        </h3>

        <div className="space-y-2 mb-4">
          {documentos.length ? (
            documentos.map((doc) => (
              <div key={doc.id} className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                <File className="w-5 h-5 text-slate-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{doc.nombre}</p>
                  <p className="text-xs text-slate-500">
                    {doc.subido_por ?? '—'}
                    {doc.created_at ? ` · ${new Date(doc.created_at).toLocaleDateString('es-PE')}` : ''}
                  </p>
                </div>
                <button
                  onClick={() => handleDownload(doc)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                  title="Descargar"
                >
                  <Download className="w-4 h-4" />
                </button>
                {canDelete && (
                  <button
                    onClick={() => handleDeleteDoc(doc.id)}
                    disabled={deletingId === doc.id}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                    title="Eliminar"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-500">No hay documentos subidos.</p>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50"
        >
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {uploading ? 'Subiendo...' : 'Subir documento'}
        </button>
        {uploadError && <p className="text-sm text-red-400 mt-2">{uploadError}</p>}
      </div>
```

- [ ] **Step 4: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: exit 0

- [ ] **Step 5: Verificar build de producción**

Run: `npm run build`
Expected: `✓ Compiled successfully`

- [ ] **Step 6: Commit**

```bash
git add components/proyectos/tabs/TabIngenieria.tsx
git commit -m "feat: sección de documentos en la pestaña Ingeniería (subir/descargar/eliminar)"
```

---

## Task 8: E2E del flujo UI + verificación final

**Files:**
- Create: `scripts/e2e-documentos.mjs`

- [ ] **Step 1: Escribir el E2E de Playwright**

```js
// scripts/e2e-documentos.mjs
import { chromium } from 'playwright';
import fs from 'fs';

const BASE = 'http://localhost:3000';
const log = (...a) => console.log(...a);
const tmpFile = 'scripts/_e2e-doc.txt';
fs.writeFileSync(tmpFile, 'documento de prueba e2e ' + Date.now());

const browser = await chromium.launch();
const page = await browser.newContext().then((c) => c.newPage());
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

try {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', 'admin@bbti.com.pe');
  await page.fill('input[type="password"]', 'admin2024');
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes('login'), { timeout: 15000 });

  await page.goto(`${BASE}/proyectos/PR-01-2026`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.click('button:has-text("Ingeniería")');
  await page.waitForTimeout(800);

  // Subir
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.click('button:has-text("Subir documento")'),
  ]);
  await chooser.setFiles(tmpFile);
  await page.waitForTimeout(4000);
  const subido = await page.locator('text=_e2e-doc.txt').count();
  log('Documento aparece tras subir:', subido ? 'SÍ ✅' : 'NO ❌');

  // Eliminar (botón Trash junto al doc)
  const fila = page.locator('div', { hasText: '_e2e-doc.txt' }).last();
  await fila.locator('button[title="Eliminar"]').click();
  await page.waitForTimeout(2500);
  const sigue = await page.locator('text=_e2e-doc.txt').count();
  log('Documento eliminado:', sigue === 0 ? 'SÍ ✅' : 'NO ❌');

  log('PAGE ERRORS:', pageErrors.length);
  pageErrors.forEach((e) => log('  ', e));
} catch (err) {
  log('✖ EXCEPCIÓN:', err.message);
} finally {
  fs.unlinkSync(tmpFile);
  await browser.close();
}
```

- [ ] **Step 2: Correr el E2E (con dev server en :3000)**

Run: `node scripts/e2e-documentos.mjs`
Expected:
```
Documento aparece tras subir: SÍ ✅
Documento eliminado: SÍ ✅
PAGE ERRORS: 0
```

- [ ] **Step 3: Correr el barrido E2E general (no se rompió nada)**

Run: `node scripts/e2e-sweep.mjs`
Expected: `0 errores reales en total` con las 8 páginas en ✅

- [ ] **Step 4: Commit**

```bash
git add scripts/e2e-documentos.mjs
git commit -m "test: E2E del flujo de subida/eliminación de documentos"
```

---

## Verificación final (cierre)

- [ ] `npx tsc --noEmit` → exit 0
- [ ] `npm run build` → `✓ Compiled successfully`
- [ ] `node scripts/test-documentos-api.mjs` → 9 OK / 0 fallos
- [ ] `node scripts/e2e-documentos.mjs` → subir ✅ / eliminar ✅ / 0 page errors
- [ ] `node scripts/e2e-sweep.mjs` → 8/8 páginas, 0 errores
