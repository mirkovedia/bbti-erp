# Notificaciones por eventos en tiempo real — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Avisar en tiempo real (campanita 🔔 dentro de la app) al área que sigue en el flujo cuando alguien hace algo (sube un documento, confirma una etapa, importa metrado, crea un proyecto).

**Architecture:** Tabla `notificaciones` con una fila por destinatario (fan-out por usuario). Un helper `notificar()` se llama desde los endpoints existentes y reparte avisos a los usuarios activos del rol destino, excluyendo al actor. La campanita usa un hook que hace fetch inicial y se suscribe a Supabase Realtime (RLS `destinatario_id = auth.uid()` filtra tanto la lectura como el tiempo real). Sin servicios externos.

**Tech Stack:** Next.js 16 (App Router), Supabase (Postgres + Realtime + service role), TypeScript, Tailwind, tsx para scripts.

**Spec:** `docs/superpowers/specs/2026-06-06-notificaciones-tiempo-real-design.md`

---

## File Structure

| Archivo | Responsabilidad |
|---------|-----------------|
| `supabase/migrations/006_notificaciones.sql` | **Crear** — tabla + índice + RLS + publication realtime |
| `types/index.ts` | **Modificar** — tipo `Notificacion` |
| `lib/notificaciones.ts` | **Crear** — `notificar` + funciones puras de enrutamiento |
| `scripts/test-notificaciones.ts` | **Crear** — unit tests de enrutamiento |
| `app/api/proyectos/route.ts` | **Modificar** — notificar al crear proyecto |
| `app/api/proyectos/[id]/route.ts` | **Modificar** — notificar en confirmar/deshacer/materiales/updateDocumento |
| `app/api/documentos/route.ts` | **Modificar** — notificar al subir documento/comprobante |
| `app/api/notificaciones/route.ts` | **Crear** — `GET` lista + no leídas |
| `app/api/notificaciones/marcar-leidas/route.ts` | **Crear** — `POST` marcar leídas |
| `scripts/e2e-notificaciones.mjs` | **Crear** — E2E del fan-out + endpoints |
| `lib/utils/format.ts` | **Modificar** — `tiempoRelativo` |
| `hooks/useNotificaciones.ts` | **Crear** — fetch + suscripción Realtime |
| `components/layout/NotificacionesBell.tsx` | **Crear** — campanita + panel |
| `components/layout/Topbar.tsx` | **Modificar** — usar `NotificacionesBell` |

**Usuarios sembrados (para el E2E)** — de `scripts/seed.ts`:
Comercial `jflores@bbti.com.pe`/`jflores03`; Ingeniería `ingenieria@bbti.com.pe`/`goscco`;
Logística `logistica@bbti.com.pe`/`carlosr`; Producción `produccion@bbti.com.pe`/`anat`;
Finanzas `finanzas@bbti.com.pe`/`rosam`; Admin `admin@bbti.com.pe`/`admin2024`.
(No hay usuario "Gerencia General" sembrado: los avisos a ese rol simplemente no tienen destinatarios, lo cual es válido.)

---

## Task 1: Migración `notificaciones`

**Files:**
- Create: `supabase/migrations/006_notificaciones.sql`

- [ ] **Step 1: Crear el archivo de migración**

```sql
-- 006_notificaciones.sql
-- Notificaciones por eventos. Fan-out: una fila por usuario destinatario.
-- El estado del proyecto / alertas por fecha NO se tocan; esto es el registro de eventos.

create table if not exists notificaciones (
  id              uuid primary key default gen_random_uuid(),
  destinatario_id uuid not null references users(id) on delete cascade,
  proyecto_id     text references proyectos(id) on delete cascade,
  tipo            text not null,   -- 'documento' | 'confirmacion' | 'datos' | 'hito'
  mensaje         text not null,
  actor           text,
  leida           boolean default false,
  created_at      timestamptz default now()
);
create index if not exists idx_notificaciones_destinatario
  on notificaciones(destinatario_id, leida);

alter table notificaciones enable row level security;

-- ÚNICA política: cada usuario VE solo lo suyo (esta misma regla filtra el Realtime).
-- No hay políticas de escritura: todo lo escribe el backend con service role (bypasea RLS).
create policy "read_own_notificaciones" on notificaciones
  for select using (destinatario_id = auth.uid());

-- Habilitar tiempo real en la tabla
alter publication supabase_realtime add table notificaciones;
```

- [ ] **Step 2: Aplicar la migración en Supabase**

Abrir el SQL Editor del proyecto Supabase `fugaqtandzdgjdhlpwae` y ejecutar el contenido del archivo.
(Mismo flujo manual con que se aplicaron `004` y `005`.)

- [ ] **Step 3: Verificar que la tabla existe y el realtime quedó habilitado**

Run: `npx tsx --env-file=.env.local -e "import('./scripts/lib/supabase-test.mjs').then(async m => { const { error } = await m.serviceClient().from('notificaciones').select('*').limit(1); console.log(error ? 'FALTA: '+error.message : 'OK tabla existe'); })"`
Expected: `OK tabla existe`

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/006_notificaciones.sql
git commit -m "feat: migracion tabla notificaciones + realtime"
```

---

## Task 2: Tipo `Notificacion`

**Files:**
- Modify: `types/index.ts`

- [ ] **Step 1: Añadir el tipo**

En `types/index.ts`, añadir al final del archivo:

```typescript
export type TipoNotificacion = 'documento' | 'confirmacion' | 'datos' | 'hito';

export interface Notificacion {
  id: string;
  destinatario_id: string;
  proyecto_id: string | null;
  tipo: TipoNotificacion;
  mensaje: string;
  actor: string | null;
  leida: boolean;
  created_at: string;
}
```

- [ ] **Step 2: Verificar compilación**

Run: `npx tsc --noEmit -p C:/ClaudecodeProjects/BBTI/bbti-erp/tsconfig.json`
Expected: sin errores nuevos.

- [ ] **Step 3: Commit**

```bash
git add types/index.ts
git commit -m "feat: tipo Notificacion"
```

---

## Task 3: Helper `notificar` + enrutamiento (TDD de las funciones puras)

**Files:**
- Create: `lib/notificaciones.ts`
- Test: `scripts/test-notificaciones.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `scripts/test-notificaciones.ts`:

```typescript
// Test de enrutamiento de notificaciones. Ejecutar: npx tsx scripts/test-notificaciones.ts
import { rolesParaConfirmacion, mensajeConfirmacion, rolDelAreaDeEtapa } from '../lib/notificaciones';

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? 'OK  ' : 'XX  ') + m); c ? pass++ : fail++; };
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// rolesParaConfirmacion
ok(eq(rolesParaConfirmacion('ingenieria'), ['Logística']), 'ingeniería → Logística');
ok(eq(rolesParaConfirmacion('logistica'), ['Producción']), 'logística → Producción');
ok(eq(rolesParaConfirmacion('produccion'), ['Comercial', 'Gerencia General']), 'producción → Comercial+Gerencia');
ok(eq(rolesParaConfirmacion('pruebas'), ['Comercial', 'Gerencia General']), 'pruebas → Comercial+Gerencia');
ok(eq(rolesParaConfirmacion('completado'), ['Comercial', 'Finanzas', 'Gerencia General']), 'completado → Comercial+Finanzas+Gerencia');

// rolDelAreaDeEtapa
ok(rolDelAreaDeEtapa('ingenieria') === 'Ingeniería', 'área de ingeniería → Ingeniería');
ok(rolDelAreaDeEtapa('logistica') === 'Logística', 'área de logística → Logística');
ok(rolDelAreaDeEtapa('produccion') === 'Producción', 'área de producción → Producción');

// mensajeConfirmacion
ok(mensajeConfirmacion('ingenieria', 'PR-01-2026').includes('PR-01-2026'), 'mensaje incluye el id');
ok(/plano/i.test(mensajeConfirmacion('ingenieria', 'PR-01-2026')), 'mensaje de ingeniería habla de planos');
ok(/complet/i.test(mensajeConfirmacion('completado', 'PR-01-2026')), 'mensaje de completado habla de completado');

console.log(`\n===== ${pass} OK / ${fail} fallos =====`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx tsx scripts/test-notificaciones.ts`
Expected: FAIL — error de import (el módulo `../lib/notificaciones` aún no existe).

- [ ] **Step 3: Implementar `lib/notificaciones.ts`**

Crear `lib/notificaciones.ts`:

```typescript
import { createAdminClient } from '@/lib/supabase/admin';
import type { Rol } from '@/types';
import type { EtapaFlujo } from '@/lib/utils/estado-proyecto';

/** Rol responsable del área de una etapa (para deshacer / pertenencia). */
export const rolDelAreaDeEtapa = (etapa: EtapaFlujo): Rol =>
  etapa === 'ingenieria' ? 'Ingeniería'
  : etapa === 'logistica' ? 'Logística'
  : 'Producción';

/** A qué roles se les avisa cuando se CONFIRMA una etapa (handoff por flujo). */
export const rolesParaConfirmacion = (etapa: EtapaFlujo): Rol[] => {
  switch (etapa) {
    case 'ingenieria': return ['Logística'];
    case 'logistica': return ['Producción'];
    case 'produccion':
    case 'pruebas': return ['Comercial', 'Gerencia General'];
    case 'completado': return ['Comercial', 'Finanzas', 'Gerencia General'];
    default: return [];
  }
};

/** Mensaje legible para la confirmación de una etapa. */
export const mensajeConfirmacion = (etapa: EtapaFlujo, proyectoId: string): string => {
  switch (etapa) {
    case 'ingenieria': return `Ingeniería firmó los planos de ${proyectoId}. Toca compras.`;
    case 'logistica': return `Logística confirmó las compras de ${proyectoId}. Toca producir.`;
    case 'produccion': return `Producción terminó ${proyectoId}. En pruebas.`;
    case 'pruebas': return `${proyectoId} pasó las pruebas. Listo para envío.`;
    case 'completado': return `${proyectoId} fue completado y entregado.`;
    default: return `Avance en ${proyectoId}.`;
  }
};

export interface NotificarInput {
  proyectoId: string;
  tipo: 'documento' | 'confirmacion' | 'datos' | 'hito';
  mensaje: string;
  rolesDestino: Rol[];
  actorId?: string;       // se excluye del fan-out
  actorNombre?: string;
}

/**
 * Crea una notificación por cada usuario activo de rolesDestino (sin el actor).
 * Nunca lanza: un fallo al notificar no debe romper la acción principal.
 */
export const notificar = async (input: NotificarInput): Promise<void> => {
  try {
    if (input.rolesDestino.length === 0) return;
    const admin = createAdminClient();
    const { data: users } = await admin
      .from('users')
      .select('id')
      .in('rol', input.rolesDestino)
      .eq('activo', true);
    const destinatarios = (users ?? []).filter((u) => u.id !== input.actorId);
    if (destinatarios.length === 0) return;
    await admin.from('notificaciones').insert(
      destinatarios.map((u) => ({
        destinatario_id: u.id,
        proyecto_id: input.proyectoId,
        tipo: input.tipo,
        mensaje: input.mensaje,
        actor: input.actorNombre ?? null,
      }))
    );
  } catch (err) {
    console.error('notificar error:', err);
  }
};
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npx tsx scripts/test-notificaciones.ts`
Expected: `===== 11 OK / 0 fallos =====`

- [ ] **Step 5: Commit**

```bash
git add lib/notificaciones.ts scripts/test-notificaciones.ts
git commit -m "feat: helper notificar + enrutamiento de notificaciones + tests"
```

---

## Task 4: Disparar notificaciones desde los endpoints

**Files:**
- Modify: `app/api/proyectos/route.ts`
- Modify: `app/api/proyectos/[id]/route.ts`
- Modify: `app/api/documentos/route.ts`

- [ ] **Step 1: Nuevo proyecto → avisa a Ingeniería**

En `app/api/proyectos/route.ts`, añadir el import (junto a los otros):

```typescript
import { notificar } from '@/lib/notificaciones';
```

En `POST`, justo antes de `return NextResponse.json(data, { status: 201 });`, añadir:

```typescript
    await notificar({
      proyectoId: id,
      tipo: 'hito',
      mensaje: `Nuevo proyecto ${id} (${body.cliente}) creado. Inicien los planos.`,
      rolesDestino: ['Ingeniería'],
      actorId: user.id,
      actorNombre: userData?.nombre,
    });
```

- [ ] **Step 2: Importar el helper y el enrutamiento en el route del detalle**

En `app/api/proyectos/[id]/route.ts`, añadir el import:

```typescript
import { notificar, rolesParaConfirmacion, mensajeConfirmacion, rolDelAreaDeEtapa } from '@/lib/notificaciones';
```

- [ ] **Step 3: Notificar al confirmar una etapa**

En `app/api/proyectos/[id]/route.ts`, dentro del bloque `if (body.confirmarEtapa?.etapa) {`, justo DESPUÉS del `await supabase.from('proyecto_confirmaciones').upsert(...)`, añadir:

```typescript
      await notificar({
        proyectoId: id,
        tipo: 'confirmacion',
        mensaje: mensajeConfirmacion(etapa, id),
        rolesDestino: rolesParaConfirmacion(etapa),
        actorId: user.id,
        actorNombre: autor,
      });
```

- [ ] **Step 4: Notificar al deshacer una etapa**

En `app/api/proyectos/[id]/route.ts`, dentro del bloque `if (body.deshacerEtapa?.etapa) {`, justo DESPUÉS del `await supabase.from('proyecto_confirmaciones').delete()...`, añadir:

```typescript
      await notificar({
        proyectoId: id,
        tipo: 'confirmacion',
        mensaje: `Se revirtió la etapa "${etapa}" de ${id}.`,
        rolesDestino: [rolDelAreaDeEtapa(etapa)],
        actorId: user.id,
        actorNombre: autor,
      });
```

- [ ] **Step 5: Notificar al importar metrado (actor = Comercial) y al enviar plano a Comercial**

En `app/api/proyectos/[id]/route.ts`, justo DESPUÉS del bloque que inserta materiales (el `if (Array.isArray(body.materiales)) { ... }`), añadir:

```typescript
    // Metrado importado: si quien manda materiales es Comercial, avisa a Logística.
    if (Array.isArray(body.materiales) && rol === 'Comercial') {
      await notificar({
        proyectoId: id,
        tipo: 'datos',
        mensaje: `Comercial importó el metrado de ${id}. Revisen las compras.`,
        rolesDestino: ['Logística'],
        actorId: user.id,
        actorNombre: autor,
      });
    }
```

En el bloque `if (body.updateDocumento?.id) { ... }`, justo DESPUÉS del `await supabase.from('proyecto_documentos').update(...)`, añadir:

```typescript
      // Plano "Enviados a comercial" → avisa a Comercial para que revise.
      if (typeof body.updateDocumento.estado === 'string' && /enviad/i.test(body.updateDocumento.estado)) {
        await notificar({
          proyectoId: id,
          tipo: 'documento',
          mensaje: `Ingeniería envió un plano de ${id} para revisión.`,
          rolesDestino: ['Comercial'],
          actorId: user.id,
          actorNombre: autor,
        });
      }
```

> `rol`, `autor` y `user` ya existen en el scope del `PATCH` (se cargan al inicio para la autorización).

- [ ] **Step 6: Notificar al subir un documento / comprobante**

En `app/api/documentos/route.ts`, añadir el import:

```typescript
import { notificar } from '@/lib/notificaciones';
```

En `POST`, reemplazar el bloque que carga `userData` y hace el insert:

```typescript
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
```

por:

```typescript
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

    // Comprobante de adelanto → Finanzas; cualquier otro documento → Comercial.
    const esComprobante = nombre.startsWith('Comprobante adelanto:');
    await notificar({
      proyectoId: proyecto_id,
      tipo: 'documento',
      mensaje: esComprobante
        ? `${userData?.nombre ?? 'Comercial'} subió el comprobante de adelanto de ${proyecto_id}.`
        : `${userData?.nombre ?? 'Alguien'} subió el documento "${nombre}" a ${proyecto_id}.`,
      rolesDestino: esComprobante ? ['Finanzas'] : ['Comercial'],
      actorId: user.id,
      actorNombre: userData?.nombre,
    });

    return NextResponse.json(data, { status: 201 });
```

- [ ] **Step 7: Build**

Run: `npm run build`
Expected: build exitoso.

- [ ] **Step 8: Commit**

```bash
git add app/api/proyectos/route.ts "app/api/proyectos/[id]/route.ts" app/api/documentos/route.ts
git commit -m "feat: disparar notificaciones en crear/confirmar/deshacer/metrado/documentos"
```

---

## Task 5: Endpoints de notificaciones (lista + marcar leídas)

**Files:**
- Create: `app/api/notificaciones/route.ts`
- Create: `app/api/notificaciones/marcar-leidas/route.ts`

- [ ] **Step 1: `GET /api/notificaciones`**

Crear `app/api/notificaciones/route.ts`:

```typescript
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    // La RLS ya acota a las del usuario; filtramos explícito por claridad.
    const { data: items } = await supabase
      .from('notificaciones')
      .select('*')
      .eq('destinatario_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);

    const { count } = await supabase
      .from('notificaciones')
      .select('*', { count: 'exact', head: true })
      .eq('destinatario_id', user.id)
      .eq('leida', false);

    return NextResponse.json({ items: items ?? [], unreadCount: count ?? 0 });
  } catch (err) {
    console.error('GET /api/notificaciones error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
```

- [ ] **Step 2: `POST /api/notificaciones/marcar-leidas`**

Crear `app/api/notificaciones/marcar-leidas/route.ts`:

```typescript
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const ids: unknown = body?.ids;

    const admin = createAdminClient();
    let query = admin.from('notificaciones').update({ leida: true }).eq('destinatario_id', user.id);
    if (Array.isArray(ids) && ids.length > 0) {
      query = query.in('id', ids as string[]);
    }
    const { error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST /api/notificaciones/marcar-leidas error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build exitoso (aparecen las rutas `/api/notificaciones` y `/api/notificaciones/marcar-leidas`).

- [ ] **Step 4: Commit**

```bash
git add app/api/notificaciones/route.ts app/api/notificaciones/marcar-leidas/route.ts
git commit -m "feat: endpoints GET notificaciones + POST marcar-leidas"
```

---

## Task 6: E2E del fan-out y los endpoints

**Files:**
- Create: `scripts/e2e-notificaciones.mjs`

- [ ] **Step 1: Escribir el E2E**

Crear `scripts/e2e-notificaciones.mjs`:

```javascript
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
```

- [ ] **Step 2: Reconstruir y reiniciar el server**

Run: `npm run build`
Run: `npx kill-port 3000; npm start` (esperar 200 en `/login`).

- [ ] **Step 3: Correr el E2E**

Run: `node scripts/e2e-notificaciones.mjs`
Expected: `===== 6 OK / 0 fallos =====`

- [ ] **Step 4: Commit**

```bash
git add scripts/e2e-notificaciones.mjs
git commit -m "test: e2e de notificaciones (fan-out, exclusion de actor, endpoints)"
```

---

## Task 7: Campanita en el Topbar (UI + tiempo real)

**Files:**
- Modify: `lib/utils/format.ts`
- Create: `hooks/useNotificaciones.ts`
- Create: `components/layout/NotificacionesBell.tsx`
- Modify: `components/layout/Topbar.tsx`

- [ ] **Step 1: Helper `tiempoRelativo`**

En `lib/utils/format.ts`, añadir al final:

```typescript
/**
 * Tiempo relativo legible a partir de un ISO timestamp.
 * Nota: usa Date.now() — solo para UI (no para lógica testeada).
 */
export const tiempoRelativo = (iso: string): string => {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'ayer' : `hace ${d} días`;
};
```

- [ ] **Step 2: Hook `useNotificaciones`**

Crear `hooks/useNotificaciones.ts`:

```typescript
'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Notificacion } from '@/types';

export const useNotificaciones = (userId: string | undefined) => {
  const [list, setList] = useState<Notificacion[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const load = useCallback(async () => {
    const res = await fetch('/api/notificaciones');
    if (res.ok) {
      const data = await res.json();
      setList(data.items as Notificacion[]);
      setUnreadCount(data.unreadCount as number);
    }
  }, []);

  useEffect(() => {
    if (!userId) return;
    load();
    const supabase = createClient();
    const channel = supabase
      .channel(`notif-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notificaciones', filter: `destinatario_id=eq.${userId}` },
        (payload) => {
          setList((prev) => [payload.new as Notificacion, ...prev].slice(0, 20));
          setUnreadCount((c) => c + 1);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, load]);

  const markAllRead = useCallback(async () => {
    await fetch('/api/notificaciones/marcar-leidas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    setList((prev) => prev.map((n) => ({ ...n, leida: true })));
    setUnreadCount(0);
  }, []);

  const markRead = useCallback(async (notifId: string) => {
    await fetch('/api/notificaciones/marcar-leidas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [notifId] }),
    });
    setList((prev) => prev.map((n) => (n.id === notifId ? { ...n, leida: true } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
  }, []);

  return { list, unreadCount, markAllRead, markRead };
};
```

- [ ] **Step 3: Componente `NotificacionesBell`**

Crear `components/layout/NotificacionesBell.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, FileText, CheckCircle2, Package, Flag } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useNotificaciones } from '@/hooks/useNotificaciones';
import { tiempoRelativo } from '@/lib/utils/format';
import type { Notificacion, TipoNotificacion } from '@/types';
import { cn } from '@/lib/utils';

const iconFor: Record<TipoNotificacion, typeof Bell> = {
  documento: FileText,
  confirmacion: CheckCircle2,
  datos: Package,
  hito: Flag,
};

const colorFor: Record<TipoNotificacion, string> = {
  documento: 'text-blue-400',
  confirmacion: 'text-green-400',
  datos: 'text-amber-400',
  hito: 'text-violet-400',
};

export const NotificacionesBell = () => {
  const router = useRouter();
  const { user } = useAppStore();
  const { list, unreadCount, markAllRead, markRead } = useNotificaciones(user?.id);
  const [open, setOpen] = useState(false);

  const onClickItem = (n: Notificacion) => {
    if (!n.leida) markRead(n.id);
    setOpen(false);
    if (n.proyecto_id) router.push(`/proyectos/${n.proyecto_id}`);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold bg-red-500 text-white rounded-full">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* backdrop para cerrar al hacer click afuera */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-80 max-h-[28rem] overflow-y-auto bg-[var(--navy2)] border border-slate-800 rounded-xl shadow-xl z-50">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
              <span className="text-sm font-semibold text-white">Notificaciones</span>
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="text-xs text-blue-400 hover:text-blue-300">
                  Marcar todas como leídas
                </button>
              )}
            </div>

            {list.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-slate-500">Sin notificaciones</div>
            ) : (
              <ul>
                {list.map((n) => {
                  const Icon = iconFor[n.tipo] ?? Bell;
                  return (
                    <li key={n.id}>
                      <button
                        onClick={() => onClickItem(n)}
                        className={cn(
                          'w-full flex items-start gap-3 px-4 py-3 text-left border-b border-slate-800/60 hover:bg-slate-800/40 transition-colors',
                          !n.leida && 'bg-slate-800/30'
                        )}
                      >
                        <Icon className={cn('w-4 h-4 mt-0.5 shrink-0', colorFor[n.tipo] ?? 'text-slate-400')} />
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm text-white">{n.mensaje}</span>
                          <span className="block text-xs text-slate-500 mt-0.5">
                            {n.actor ? `${n.actor} · ` : ''}{tiempoRelativo(n.created_at)}
                          </span>
                        </span>
                        {!n.leida && <span className="w-2 h-2 mt-1.5 rounded-full bg-blue-500 shrink-0" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
};
```

- [ ] **Step 4: Usar la campanita en el Topbar**

En `components/layout/Topbar.tsx`:

1. Quitar `Bell` del import de `lucide-react` (lo usa ahora `NotificacionesBell`). La línea queda:

```typescript
import { LogOut } from 'lucide-react';
```

2. Añadir el import del componente:

```typescript
import { NotificacionesBell } from '@/components/layout/NotificacionesBell';
```

3. Reemplazar el bloque del botón estático:

```tsx
        {/* Notifications bell */}
        <button className="relative p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
        </button>
```

por:

```tsx
        {/* Notifications bell */}
        <NotificacionesBell />
```

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: build exitoso, sin warnings de imports sin usar.

- [ ] **Step 6: Verificación visual + tiempo real (manual)**

Run: `npx kill-port 3000; npm start` (esperar 200 en `/login`).
- Entrar como Admin, abrir la campanita → se ven notificaciones (las generadas por el E2E ya se limpiaron; generar una nueva creando un proyecto).
- **Tiempo real:** abrir dos navegadores/sesiones — una como Ingeniería, otra como Logística. Como Admin/Ingeniería confirmar la etapa de Ingeniería de un proyecto y ver que a la sesión de **Logística** le sube el badge sin recargar.

- [ ] **Step 7: Commit**

```bash
git add lib/utils/format.ts hooks/useNotificaciones.ts components/layout/NotificacionesBell.tsx components/layout/Topbar.tsx
git commit -m "feat: campanita de notificaciones en tiempo real en el Topbar"
```

---

## Task 8: Regresión

**Files:** (sin cambios de código; verificación)

- [ ] **Step 1: Sweep de las 8 páginas**

Asegurar el server de producción en :3000 (build + start si hubo cambios).

Run: `node scripts/e2e-sweep.mjs`
Expected: 8 páginas, 0 errores de consola (el Topbar con la campanita real renderiza limpio).

- [ ] **Step 2: Re-correr la suite del feature**

Run: `npx tsx scripts/test-notificaciones.ts`
Expected: `11 OK / 0 fallos`.

Run: `node scripts/e2e-notificaciones.mjs`
Expected: `6 OK / 0 fallos`.

- [ ] **Step 3: Commit (si hubo ajustes) / cierre**

```bash
git add -A
git commit -m "test: regresion verde con notificaciones"
```

---

## Self-Review (verificado al escribir el plan)

- **Cobertura del spec:** tabla+RLS+realtime (T1), tipo (T2), helper+enrutamiento+tests (T3), disparadores en los 6 puntos de integración (T4), endpoints GET/marcar-leidas (T5), E2E con fan-out + exclusión de actor + marcar leídas (T6), `tiempoRelativo`+hook Realtime+campanita+Topbar (T7), regresión (T8). "Proyecto retrasado" queda explícitamente fuera (fase 2, en el spec).
- **Sin placeholders:** todo el código va completo en cada paso.
- **Consistencia de tipos:** `Notificacion`/`TipoNotificacion` (T2) se usan en helper, endpoints, hook y componente. `notificar`, `rolesParaConfirmacion`, `mensajeConfirmacion`, `rolDelAreaDeEtapa` (T3) se invocan con la misma firma en T4. `NotificarInput.rolesDestino` siempre recibe `Rol[]`. `useNotificaciones(userId)` (T7) consume los endpoints de T5.
- **Patrón de hooks/git separados:** los commits de git van en pasos propios; en ejecución, separar `git add`/`commit` del build para no disparar el hook `block-no-verify`.
