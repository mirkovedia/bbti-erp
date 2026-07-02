# Alerta automática de vencimiento (cron diario) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un job diario en Vercel Cron que detecta proyectos retrasados y por vencer y notifica una sola vez (por cruce) al área responsable.

**Architecture:** Endpoint `GET /api/cron/alertas-vencimiento` protegido con `CRON_SECRET`, disparado por Vercel Cron 1×/día. Usa el admin client (service role), funciones puras en `lib/utils/vencimiento.ts` para clasificar, el helper `notificar()` para el fan-out, y una tabla `proyecto_alertas_enviadas` para deduplicar (edge-triggered).

**Tech Stack:** Next.js 16 (App Router, route handlers), Supabase (service role), TypeScript, tsx para tests, Playwright/fetch para integración, Vercel Cron.

## Global Constraints

- **Next.js 16:** route handlers en `app/api/.../route.ts`, export `async function GET(req: NextRequest)`. Es Next 16 (no 15) — no usar APIs deprecadas.
- **Migraciones:** SQL en `supabase/migrations/`, numeradas. La próxima es **015** (014 ya existe).
- **Variables `URL`:** en scripts Node, NUNCA nombrar una variable `URL` (pisa la clase global de supabase-js). Usar el helper `scripts/lib/supabase-test.mjs`.
- **`notificar()` no lanza:** ya tiene try/catch interno; no envolver en otro try innecesario.
- **Idioma:** comentarios y commits en español; identificadores en inglés.
- **Perú = UTC-5 sin DST:** `hoy` se calcula como fecha de Lima, no UTC crudo.
- **Fan-out:** `notificar({ rolesDestino })` notifica a usuarios activos del rol, excluye al actor (por `actorId`). Para el cron NO se pasa `actorId` (lo emite el sistema).

---

### Task 1: Funciones puras de clasificación de vencimiento

**Files:**
- Create: `lib/utils/vencimiento.ts`
- Test: `scripts/test-vencimiento.ts`

**Interfaces:**
- Consumes: `EstadoProyecto` de `@/types`.
- Produces:
  - `type TipoVencimiento = 'retrasado' | 'por_vencer'`
  - `diasDeDiferencia(a: string, b: string): number` — `(b - a)` en días enteros (fechas `YYYY-MM-DD`).
  - `clasificarVencimiento(fechaEntrega: string | null | undefined, hoy: string, diasAlerta: number, estado: EstadoProyecto): TipoVencimiento | null`
  - `mensajeVencimiento(tipo: TipoVencimiento, proyectoId: string, cliente: string, dias: number, etapaLabel: string): string`

- [ ] **Step 1: Escribir el test que falla**

Create `scripts/test-vencimiento.ts`:

```ts
// Tests unitarios de las funciones puras de vencimiento.
import { clasificarVencimiento, mensajeVencimiento, diasDeDiferencia } from '../lib/utils/vencimiento';

let pass = 0, fail = 0;
const eq = (got: unknown, exp: unknown, msg: string) => {
  const ok = JSON.stringify(got) === JSON.stringify(exp);
  console.log((ok ? '✅ ' : `❌ (got ${JSON.stringify(got)}) `) + msg);
  ok ? pass++ : fail++;
};

// diasDeDiferencia
eq(diasDeDiferencia('2026-06-23', '2026-06-30'), 7, 'diasDeDiferencia 7 días adelante');
eq(diasDeDiferencia('2026-06-23', '2026-06-20'), -3, 'diasDeDiferencia 3 días atrás');
eq(diasDeDiferencia('2026-06-23', '2026-06-23'), 0, 'diasDeDiferencia mismo día = 0');

// clasificarVencimiento (diasAlerta = 7, hoy = 2026-06-23)
const HOY = '2026-06-23';
eq(clasificarVencimiento('2026-06-20', HOY, 7, 'EN PRODUCCIÓN'), 'retrasado', 'vencido → retrasado');
eq(clasificarVencimiento('2026-06-23', HOY, 7, 'EN PRODUCCIÓN'), 'por_vencer', 'vence hoy → por_vencer');
eq(clasificarVencimiento('2026-06-30', HOY, 7, 'EN PRODUCCIÓN'), 'por_vencer', 'justo en el umbral (hoy+7) → por_vencer');
eq(clasificarVencimiento('2026-07-01', HOY, 7, 'EN PRODUCCIÓN'), null, 'fuera del umbral → null');
eq(clasificarVencimiento('2026-06-20', HOY, 7, 'COMPLETADO'), null, 'completado nunca alerta');
eq(clasificarVencimiento(null, HOY, 7, 'EN PRODUCCIÓN'), null, 'sin fecha → null');

// mensajeVencimiento
eq(
  mensajeVencimiento('retrasado', 'PR-01-2026', 'ACME', 3, 'Compras'),
  'PR-01-2026 (ACME) está retrasado 3 día(s). Está en Compras.',
  'mensaje retrasado'
);
eq(
  mensajeVencimiento('por_vencer', 'PR-01-2026', 'ACME', 5, 'Ingeniería'),
  'PR-01-2026 (ACME) vence en 5 día(s). Está en Ingeniería.',
  'mensaje por_vencer'
);

console.log(`\n===== ${pass} OK / ${fail} fallos =====`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx tsx scripts/test-vencimiento.ts`
Expected: FAIL — `Cannot find module '../lib/utils/vencimiento'`.

- [ ] **Step 3: Implementar las funciones puras**

Create `lib/utils/vencimiento.ts`:

```ts
import type { EstadoProyecto } from '@/types';

export type TipoVencimiento = 'retrasado' | 'por_vencer';

/** Días enteros entre dos fechas YYYY-MM-DD, calculado como (b - a). */
export const diasDeDiferencia = (a: string, b: string): number => {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
};

/**
 * Clasifica el vencimiento de un proyecto respecto a hoy.
 * - COMPLETADO o sin fecha → null (nunca alerta).
 * - fecha < hoy → 'retrasado'.
 * - hoy <= fecha <= hoy + diasAlerta → 'por_vencer'.
 * - resto → null.
 */
export const clasificarVencimiento = (
  fechaEntrega: string | null | undefined,
  hoy: string,
  diasAlerta: number,
  estado: EstadoProyecto
): TipoVencimiento | null => {
  if (estado === 'COMPLETADO' || !fechaEntrega) return null;
  const diff = diasDeDiferencia(hoy, fechaEntrega); // fechaEntrega - hoy
  if (diff < 0) return 'retrasado';
  if (diff <= diasAlerta) return 'por_vencer';
  return null;
};

/** Texto legible del aviso de vencimiento. */
export const mensajeVencimiento = (
  tipo: TipoVencimiento,
  proyectoId: string,
  cliente: string,
  dias: number,
  etapaLabel: string
): string =>
  tipo === 'retrasado'
    ? `${proyectoId} (${cliente}) está retrasado ${dias} día(s). Está en ${etapaLabel}.`
    : `${proyectoId} (${cliente}) vence en ${dias} día(s). Está en ${etapaLabel}.`;
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npx tsx scripts/test-vencimiento.ts`
Expected: PASS — `===== 11 OK / 0 fallos =====`.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add lib/utils/vencimiento.ts scripts/test-vencimiento.ts
git commit -m "feat: funciones puras de clasificacion de vencimiento + tests"
```

---

### Task 2: Migración de la tabla de deduplicación + tipo de notificación

**Files:**
- Create: `supabase/migrations/015_alertas_vencimiento.sql`
- Modify: `lib/notificaciones.ts` (union `NotificarInput.tipo`, línea ~37)

**Interfaces:**
- Produces: tabla `proyecto_alertas_enviadas (proyecto_id text, tipo text, enviada_at, unique(proyecto_id,tipo))`; tipo `'vencimiento'` aceptado por `NotificarInput`.

- [ ] **Step 1: Escribir la migración**

Create `supabase/migrations/015_alertas_vencimiento.sql`:

```sql
-- Memoria de alertas de vencimiento ya enviadas (comportamiento edge-triggered:
-- un aviso por cruce de estado). El unique evita duplicados.
create table if not exists proyecto_alertas_enviadas (
  id          bigint generated always as identity primary key,
  proyecto_id text not null references proyectos(id) on delete cascade,
  tipo        text not null check (tipo in ('por_vencer', 'retrasado')),
  enviada_at  timestamptz not null default now(),
  unique (proyecto_id, tipo)
);

alter table proyecto_alertas_enviadas enable row level security;
-- Sin políticas públicas: solo el backend (service role) escribe/lee. El service
-- role bypassa RLS, así que no hace falta ninguna policy.
```

- [ ] **Step 2: Agregar 'vencimiento' al tipo de notificación**

In `lib/notificaciones.ts`, modify the `tipo` field of `NotificarInput` (línea ~37):

```ts
  tipo: 'documento' | 'confirmacion' | 'datos' | 'hito' | 'vencimiento';
```

(La columna `notificaciones.tipo` es `text` sin CHECK en la BD, así que acepta el nuevo valor sin migración adicional.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/015_alertas_vencimiento.sql lib/notificaciones.ts
git commit -m "feat: migracion 015 tabla dedup de alertas + tipo vencimiento en notificar"
```

- [ ] **Step 5: Aplicar la migración en Supabase (acción del usuario)**

Pegar el contenido de `supabase/migrations/015_alertas_vencimiento.sql` en el SQL Editor de Supabase (proyecto `<project-ref>`) y ejecutarlo. Verificar que la tabla `proyecto_alertas_enviadas` aparezca en el Table Editor. **El endpoint y el e2e de la Task 3 requieren esta tabla aplicada.**

---

### Task 3: Endpoint del cron + configuración + test de integración

**Files:**
- Create: `app/api/cron/alertas-vencimiento/route.ts`
- Create: `vercel.json`
- Modify: `.env.local` (añadir `CRON_SECRET`)
- Test: `scripts/e2e-alertas-vencimiento.mjs`

**Interfaces:**
- Consumes: `clasificarVencimiento`, `mensajeVencimiento`, `diasDeDiferencia` (Task 1); `notificar` con `tipo:'vencimiento'` (Task 2); de `@/lib/utils/estado-proyecto`: `computeEstadoFromConfirmaciones`, `FLOW_ETAPAS`, `ETAPA_LABEL`, `EtapaFlujo`; de `@/lib/notificaciones`: `rolDelAreaDeEtapa`; de `@/lib/supabase/admin`: `createAdminClient`.
- Produces: `GET /api/cron/alertas-vencimiento` → `200 { revisados, avisados, detalle }` con header válido, `401` sin él.

- [ ] **Step 1: Añadir CRON_SECRET a .env.local**

Agregar una línea al final de `.env.local` (valor arbitrario largo; elegir uno fijo):

```
CRON_SECRET=<valor-secreto-largo>   # el valor real vive solo en .env.local
```

- [ ] **Step 2: Escribir el endpoint**

Create `app/api/cron/alertas-vencimiento/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  computeEstadoFromConfirmaciones,
  FLOW_ETAPAS,
  ETAPA_LABEL,
  type EtapaFlujo,
} from '@/lib/utils/estado-proyecto';
import { rolDelAreaDeEtapa, notificar } from '@/lib/notificaciones';
import { clasificarVencimiento, mensajeVencimiento, diasDeDiferencia } from '@/lib/utils/vencimiento';

// Normaliza el embed de Supabase (objeto cuando la FK es única, array si no).
const one = (v: unknown) => (Array.isArray(v) ? v[0] ?? null : v ?? null);

export async function GET(req: NextRequest) {
  // Vercel Cron inyecta automáticamente "Authorization: Bearer <CRON_SECRET>".
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    // Fecha de hoy en zona America/Lima (UTC-5, sin horario de verano).
    const hoy = new Date(Date.now() - 5 * 3_600_000).toISOString().split('T')[0];

    const { data: cfg } = await admin.from('company_config').select('dias_alerta').maybeSingle();
    const diasAlerta = Number(cfg?.dias_alerta) || 7;

    const { data: proyectos } = await admin
      .from('proyectos')
      .select('id, cliente, activo, proyecto_comercial(fecha_entrega), proyecto_confirmaciones(etapa)');

    const { data: yaEnviadas } = await admin
      .from('proyecto_alertas_enviadas')
      .select('proyecto_id, tipo');
    const enviadasSet = new Set((yaEnviadas ?? []).map((r) => `${r.proyecto_id}:${r.tipo}`));

    const vigentes = new Set<string>(); // claves que aplican hoy (para housekeeping)
    const detalle: { id: string; tipo: string }[] = [];
    let avisados = 0;

    for (const p of proyectos ?? []) {
      if (p.activo === false) continue;
      const comercial = one(p.proyecto_comercial) as { fecha_entrega?: string | null } | null;
      const fechaEntrega = comercial?.fecha_entrega ?? null;
      const confirmaciones = Array.isArray(p.proyecto_confirmaciones) ? p.proyecto_confirmaciones : [];
      const confirmadas = new Set<EtapaFlujo>(
        confirmaciones.map((c: { etapa: string }) => c.etapa as EtapaFlujo)
      );
      const estado = computeEstadoFromConfirmaciones(confirmadas);
      const tipo = clasificarVencimiento(fechaEntrega, hoy, diasAlerta, estado);
      if (!tipo) continue;

      const key = `${p.id}:${tipo}`;
      vigentes.add(key);
      if (enviadasSet.has(key)) continue; // ya se avisó este cruce

      const etapa = FLOW_ETAPAS.find((e) => !confirmadas.has(e)) ?? 'completado';
      const dias = Math.abs(diasDeDiferencia(hoy, fechaEntrega as string));
      await notificar({
        proyectoId: p.id,
        tipo: 'vencimiento',
        mensaje: mensajeVencimiento(tipo, p.id, p.cliente ?? '', dias, ETAPA_LABEL[etapa]),
        rolesDestino: [rolDelAreaDeEtapa(etapa)],
        actorNombre: 'Sistema',
      });
      await admin.from('proyecto_alertas_enviadas').insert({ proyecto_id: p.id, tipo });
      avisados++;
      detalle.push({ id: p.id, tipo });
    }

    // Housekeeping: borrar filas dedup que ya no aplican (reprogramados a futuro,
    // completados o eliminados) → permite re-alertar si el proyecto vuelve a cruzar.
    for (const r of yaEnviadas ?? []) {
      if (!vigentes.has(`${r.proyecto_id}:${r.tipo}`)) {
        await admin
          .from('proyecto_alertas_enviadas')
          .delete()
          .eq('proyecto_id', r.proyecto_id)
          .eq('tipo', r.tipo);
      }
    }

    return NextResponse.json({ revisados: (proyectos ?? []).length, avisados, detalle });
  } catch (err) {
    console.error('cron alertas-vencimiento error:', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Crear vercel.json con el cron**

Create `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/alertas-vencimiento",
      "schedule": "0 13 * * *"
    }
  ]
}
```

(`0 13 * * *` = 13:00 UTC = 08:00 Lima, 1×/día.)

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Escribir el test de integración**

> Requiere: migración 015 aplicada (Task 2 Step 5) y un dev server corriendo (`npm run dev`). Usar `getAuthCookie` no hace falta acá (el endpoint usa CRON_SECRET, no sesión).

Create `scripts/e2e-alertas-vencimiento.mjs`:

```js
// Integración: el cron de vencimiento avisa una sola vez por cruce al área
// responsable, deduplica, y limpia (housekeeping) cuando el proyecto deja de aplicar.
import fs from 'fs';
import { serviceClient } from './lib/supabase-test.mjs';

const BASE = process.env.BASE || 'http://localhost:3000';
const env = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const SECRET = (env.match(/^CRON_SECRET=(.*)$/m)?.[1] || '').trim();
const svc = serviceClient();
let pass = 0, fail = 0;
const check = (c, m) => { console.log((c ? '✅ ' : '❌ ') + m); c ? pass++ : fail++; };

const runCron = () =>
  fetch(`${BASE}/api/cron/alertas-vencimiento`, { headers: { authorization: `Bearer ${SECRET}` } });

// destinatario esperado: Ingeniería (proyecto nuevo, sin firmas → primera etapa = ingeniería)
const { data: ingUser } = await svc
  .from('users').select('id,nombre').eq('rol', 'Ingeniería').eq('activo', true).limit(1).maybeSingle();

// 0) auth: sin el header correcto → 401
const noauth = await fetch(`${BASE}/api/cron/alertas-vencimiento`);
check(noauth.status === 401, `sin CRON_SECRET → 401 (${noauth.status})`);

// 1) crear proyecto retrasado (fecha de entrega en el pasado)
const id = `TEST-VENC-${Date.now()}`;
// fecha_creacion es NOT NULL sin default; activo viene de la migración 010.
await svc.from('proyectos').insert({ id, cliente: 'PROBE VENCIMIENTO', monto: 100000, fecha_creacion: '2026-06-23', activo: true });
await svc.from('proyecto_comercial').insert({ proyecto_id: id, fecha_entrega: '2020-01-01' });
await svc.from('notificaciones').delete().eq('proyecto_id', id);
await svc.from('proyecto_alertas_enviadas').delete().eq('proyecto_id', id);

// 2) primer run → debe avisar a Ingeniería + crear fila dedup
const r1 = await runCron();
const j1 = await r1.json();
check(r1.status === 200, `run 1 → 200 (${r1.status})`);
await new Promise((res) => setTimeout(res, 600));
const { data: n1 } = await svc.from('notificaciones').select('*').eq('proyecto_id', id);
const haciaIng = (n1 || []).filter((n) => n.destinatario_id === ingUser?.id && n.tipo === 'vencimiento');
check(haciaIng.length === 1, `Ingeniería recibió 1 aviso de vencimiento (${haciaIng.length})`);
if (haciaIng[0]) console.log('   mensaje:', haciaIng[0].mensaje);
const { data: d1 } = await svc.from('proyecto_alertas_enviadas').select('*').eq('proyecto_id', id);
check(d1?.length === 1 && d1[0].tipo === 'retrasado', `fila dedup 'retrasado' creada (${d1?.length})`);

// 3) segundo run → NO debe duplicar
const r2 = await runCron();
check(r2.status === 200, `run 2 → 200 (${r2.status})`);
await new Promise((res) => setTimeout(res, 600));
const { data: n2 } = await svc.from('notificaciones').select('*').eq('proyecto_id', id).eq('tipo', 'vencimiento');
check((n2 || []).length === 1, `sin duplicado tras 2do run (${(n2 || []).length})`);

// 4) reprogramar a futuro lejano → housekeeping borra la fila dedup
await svc.from('proyecto_comercial').update({ fecha_entrega: '2099-12-31' }).eq('proyecto_id', id);
const r3 = await runCron();
check(r3.status === 200, `run 3 → 200 (${r3.status})`);
const { data: d3 } = await svc.from('proyecto_alertas_enviadas').select('*').eq('proyecto_id', id);
check((d3 || []).length === 0, `housekeeping limpió la fila dedup (${(d3 || []).length})`);

// limpieza
await svc.from('notificaciones').delete().eq('proyecto_id', id);
await svc.from('proyecto_alertas_enviadas').delete().eq('proyecto_id', id);
await svc.from('proyectos').delete().eq('id', id);
console.log(`\n===== ${pass} OK / ${fail} fallos =====`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 6: Arrancar el dev server (si no está) y correr el test**

Run (server): `npm run dev` (en background; esperar a que `/login` responda 200).
Run (test): `npx tsx --env-file=.env.local scripts/e2e-alertas-vencimiento.mjs`
Expected: PASS — `===== 7 OK / 0 fallos =====`.

- [ ] **Step 7: Commit**

```bash
git add app/api/cron/alertas-vencimiento/route.ts vercel.json scripts/e2e-alertas-vencimiento.mjs
git commit -m "feat: endpoint cron de alerta de vencimiento + vercel.json + e2e"
```

(`.env.local` está gitignored — NO se commitea. El `CRON_SECRET` se carga aparte en Vercel, Task 4.)

---

### Task 4: Desplegar y registrar el cron en Vercel

**Files:** ninguno (configuración de despliegue).

- [ ] **Step 1: Cargar CRON_SECRET en Vercel (los 3 entornos)**

Run (canalizando el valor desde `.env.local`, sin exponerlo en el historial):

```bash
grep '^CRON_SECRET=' .env.local | cut -d= -f2- | tr -d '\r\n' | vercel env add CRON_SECRET production
grep '^CRON_SECRET=' .env.local | cut -d= -f2- | tr -d '\r\n' | vercel env add CRON_SECRET preview
grep '^CRON_SECRET=' .env.local | cut -d= -f2- | tr -d '\r\n' | vercel env add CRON_SECRET development
```

(Si `vercel` pide confirmación interactiva, el usuario la corre con `! <comando>`.)

- [ ] **Step 2: Push a master (Vercel redeploya y registra el cron)**

```bash
git push origin master
```

- [ ] **Step 3: Verificar el deploy y el cron**

- En el dashboard de Vercel → proyecto `bbti-erp` → pestaña **Cron Jobs**: debe aparecer `/api/cron/alertas-vencimiento` con schedule `0 13 * * *`.
- Smoke manual del endpoint en prod (debe dar 401 sin el secreto):

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://bbti-erp.vercel.app/api/cron/alertas-vencimiento
```
Expected: `401`.

- [ ] **Step 4: Disparo manual en prod con el secreto (opcional, smoke real)**

```bash
SECRET=$(grep '^CRON_SECRET=' .env.local | cut -d= -f2- | tr -d '\r\n')
curl -s -H "authorization: Bearer $SECRET" https://bbti-erp.vercel.app/api/cron/alertas-vencimiento
```
Expected: JSON `{ "revisados": N, "avisados": M, "detalle": [...] }`.

---

## Self-Review

**Spec coverage:**
- Alcance retrasados + por vencer → `clasificarVencimiento` (Task 1) ✔
- Edge-triggered + dedup → tabla `proyecto_alertas_enviadas` (Task 2) + lógica enviadasSet (Task 3) ✔
- Destinatario área responsable → `FLOW_ETAPAS.find(no confirmada)` + `rolDelAreaDeEtapa` (Task 3) ✔
- Vercel Cron + CRON_SECRET → `vercel.json` + check de header (Task 3) + env en Vercel (Task 4) ✔
- Exclusión COMPLETADO/papelera → `clasificarVencimiento` (estado) + `if (p.activo === false) continue` (Task 3) ✔
- Fecha Lima → `Date.now() - 5h` (Task 3) ✔
- Housekeeping → loop de borrado (Task 3) ✔
- Testing unit + integración → Tasks 1 y 3 ✔

**Placeholder scan:** sin TBD/TODO; todo el código está completo e inline.

**Type consistency:** `clasificarVencimiento`/`mensajeVencimiento`/`diasDeDiferencia` mismas firmas en Task 1 (definición) y Task 3 (consumo). `tipo:'vencimiento'` agregado en Task 2 antes de usarse en Task 3. `FLOW_ETAPAS`, `ETAPA_LABEL`, `EtapaFlujo`, `rolDelAreaDeEtapa`, `computeEstadoFromConfirmaciones`, `createAdminClient` verificados contra el código existente.
