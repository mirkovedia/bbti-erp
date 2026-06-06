# Confirmación manual de etapas del flujo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el avance automático del estado del proyecto por una confirmación manual (sign-off) por etapa, con un panel "Verificador" visible que muestra requisitos, permite firmar/deshacer y mueve el stepper.

**Architecture:** El estado del proyecto pasa a derivarse de filas en una tabla nueva `proyecto_confirmaciones` (una por etapa firmada) en vez de los datos crudos. Dos funciones puras gobiernan la UI: `computeReadiness` (habilita el botón según datos+orden) y `computeEstadoFromConfirmaciones` (mapea firmas → estado). La API gana acciones `confirmarEtapa`/`deshacerEtapa` que revalidan readiness en el server. Un panel `FlujoVerificacion` bajo el stepper es el único punto de control.

**Tech Stack:** Next.js 16 (App Router), Supabase (Postgres + service role), TypeScript, Tailwind, tsx para scripts, Playwright para E2E.

**Spec:** `docs/superpowers/specs/2026-06-05-confirmacion-etapas-flujo-design.md`

---

## File Structure

| Archivo | Responsabilidad |
|---------|-----------------|
| `supabase/migrations/005_confirmaciones_flujo.sql` | **Crear** — tabla `proyecto_confirmaciones` + RLS |
| `types/index.ts` | **Modificar** — `Confirmacion`, `Proyecto.confirmaciones` |
| `lib/utils/estado-proyecto.ts` | **Modificar** — `Etapa`, `FLOW_ETAPAS`, `ETAPA_LABEL`, `permForEtapa`, `computeReadiness`, `computeEstadoFromConfirmaciones`, `cascadeEtapas`, `computeFlujoRows` |
| `scripts/test-flujo-confirmaciones.ts` | **Crear** — unit tests de las funciones puras |
| `app/api/proyectos/[id]/route.ts` | **Modificar** — acciones `confirmarEtapa`/`deshacerEtapa`; estado desde confirmaciones; GET incluye confirmaciones |
| `app/api/proyectos/route.ts` | **Modificar** — lista: embeber confirmaciones + estado desde firmas |
| `scripts/e2e-confirmaciones.mjs` | **Crear** — E2E del flujo completo contra API real |
| `components/proyectos/FlujoVerificacion.tsx` | **Crear** — panel verificador |
| `components/proyectos/EstadoStepper.tsx` | **Modificar** — iluminar desde confirmaciones |
| `app/(dashboard)/proyectos/[id]/page.tsx` | **Modificar** — render del panel bajo el stepper |
| `components/proyectos/tabs/TabProduccion.tsx` | **Modificar** — quitar checkboxes pruebas/envío; persistir progreso al cambiar etapa |
| `scripts/backfill-confirmaciones.ts` | **Crear** — backfill de proyectos existentes |

---

## Task 1: Migración de la tabla `proyecto_confirmaciones`

**Files:**
- Create: `supabase/migrations/005_confirmaciones_flujo.sql`

- [ ] **Step 1: Crear el archivo de migración**

```sql
-- 005_confirmaciones_flujo.sql
-- Confirmación manual (sign-off) de cada etapa del flujo. Una fila = una etapa firmada.
-- Ausencia de fila = etapa no firmada. El estado del proyecto se deriva de estas filas.

create table if not exists proyecto_confirmaciones (
  proyecto_id    text not null references proyectos(id) on delete cascade,
  etapa          text not null check (etapa in
                   ('ingenieria','logistica','produccion','pruebas','completado')),
  confirmada_por text,
  confirmada_at  timestamptz not null default now(),
  primary key (proyecto_id, etapa)
);

alter table proyecto_confirmaciones enable row level security;

-- Lectura para autenticados; escritura para autenticados (el backend usa service role).
create policy "auth_read_confirmaciones" on proyecto_confirmaciones
  for select using (auth.role() = 'authenticated');
create policy "auth_write_confirmaciones" on proyecto_confirmaciones
  for all using (auth.role() = 'authenticated');
```

- [ ] **Step 2: Aplicar la migración en Supabase**

Abrir el SQL Editor del proyecto Supabase `fugaqtandzdgjdhlpwae` y ejecutar el contenido del archivo.
(Es el mismo flujo manual con que se aplicó `004_documentos_estado.sql`.)

- [ ] **Step 3: Verificar que la tabla existe**

Run: `npx tsx --env-file=.env.local -e "import('./scripts/lib/supabase-test.mjs').then(async m => { const { error } = await m.serviceClient().from('proyecto_confirmaciones').select('*').limit(1); console.log(error ? 'FALTA: '+error.message : 'OK tabla existe'); })"`
Expected: `OK tabla existe`

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/005_confirmaciones_flujo.sql
git commit -m "feat: migracion tabla proyecto_confirmaciones (sign-off de etapas)"
```

---

## Task 2: Tipos y constantes del flujo

**Files:**
- Modify: `types/index.ts`

- [ ] **Step 1: Añadir el tipo `Confirmacion` y el campo en `Proyecto`**

En `types/index.ts`, añadir antes de `export interface Proyecto`:

```typescript
export type EtapaFlujo = 'ingenieria' | 'logistica' | 'produccion' | 'pruebas' | 'completado';

export interface Confirmacion {
  proyecto_id: string;
  etapa: EtapaFlujo;
  confirmada_por: string | null;
  confirmada_at: string | null;
}
```

Y dentro de `interface Proyecto`, justo después de la línea `documentos?: Documento[];`, añadir:

```typescript
  confirmaciones?: Confirmacion[];
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit -p C:/ClaudecodeProjects/BBTI/bbti-erp/tsconfig.json`
Expected: sin errores nuevos relacionados a `types/index.ts`.

- [ ] **Step 3: Commit**

```bash
git add types/index.ts
git commit -m "feat: tipos Confirmacion y EtapaFlujo"
```

---

## Task 3: Funciones puras del flujo (TDD)

**Files:**
- Modify: `lib/utils/estado-proyecto.ts`
- Test: `scripts/test-flujo-confirmaciones.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `scripts/test-flujo-confirmaciones.ts`:

```typescript
// Test de la lógica de confirmaciones de etapa. Ejecutar: npx tsx scripts/test-flujo-confirmaciones.ts
import {
  computeReadiness,
  computeEstadoFromConfirmaciones,
  cascadeEtapas,
  computeFlujoRows,
} from '../lib/utils/estado-proyecto';

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? 'OK  ' : 'XX  ') + m); c ? pass++ : fail++; };

const docAprob = [{ estado: 'Aprobados y firmados' }];
const matsOk = [{ estado: 'COMPLETO' }, { estado: 'COMPLETO' }];
const matsParcial = [{ estado: 'COMPLETO' }, { estado: 'PENDIENTE' }];
const etapasOk = [{ estado: 'COMPLETADO' }, { estado: 'COMPLETADO' }];

// --- computeReadiness ---
// Ingeniería lista solo si hay un plano aprobado
ok(computeReadiness({ documentos: docAprob }).ingenieria === true, 'plano aprobado → ingeniería lista');
ok(computeReadiness({ documentos: [{ estado: 'En proceso' }] }).ingenieria === false, 'plano en proceso → ingeniería NO lista');

// Logística NO lista si ingeniería no está firmada, aunque materiales COMPLETO
ok(computeReadiness({ documentos: docAprob, materiales: matsOk }).logistica === false,
  'materiales OK pero ingeniería sin firmar → logística NO lista');
// Logística lista si ingeniería firmada y materiales COMPLETO
ok(computeReadiness({ confirmaciones: [{ etapa: 'ingenieria' }], materiales: matsOk }).logistica === true,
  'ingeniería firmada + materiales OK → logística lista');
// Logística NO lista si materiales a medias
ok(computeReadiness({ confirmaciones: [{ etapa: 'ingenieria' }], materiales: matsParcial }).logistica === false,
  'ingeniería firmada + materiales parciales → logística NO lista');

// Producción lista si logística firmada y etapas COMPLETADO
ok(computeReadiness({ confirmaciones: [{ etapa: 'logistica' }], etapas: etapasOk }).produccion === true,
  'logística firmada + etapas OK → producción lista');

// Pruebas lista en cuanto producción firmada (sin condición de datos)
ok(computeReadiness({ confirmaciones: [{ etapa: 'produccion' }] }).pruebas === true,
  'producción firmada → pruebas lista');
// Completado lista en cuanto pruebas firmada
ok(computeReadiness({ confirmaciones: [{ etapa: 'pruebas' }] }).completado === true,
  'pruebas firmada → completado lista');

// --- computeEstadoFromConfirmaciones ---
ok(computeEstadoFromConfirmaciones(new Set()) === 'EN INGENIERÍA', 'sin firmas → EN INGENIERÍA');
ok(computeEstadoFromConfirmaciones(new Set(['ingenieria'])) === 'COMPRAS EN CURSO', 'ingeniería → COMPRAS EN CURSO');
ok(computeEstadoFromConfirmaciones(new Set(['ingenieria', 'logistica'])) === 'EN PRODUCCIÓN', 'logística → EN PRODUCCIÓN');
ok(computeEstadoFromConfirmaciones(new Set(['ingenieria', 'logistica', 'produccion'])) === 'LISTO PARA PRUEBAS', 'producción → LISTO PARA PRUEBAS');
ok(computeEstadoFromConfirmaciones(new Set(['ingenieria', 'logistica', 'produccion', 'pruebas'])) === 'LISTO PARA PRUEBAS', 'pruebas → sigue LISTO PARA PRUEBAS');
ok(computeEstadoFromConfirmaciones(new Set(['ingenieria', 'logistica', 'produccion', 'pruebas', 'completado'])) === 'COMPLETADO', 'completado → COMPLETADO');

// --- cascadeEtapas ---
ok(JSON.stringify(cascadeEtapas('logistica')) === JSON.stringify(['logistica', 'produccion', 'pruebas', 'completado']),
  'cascada de logística incluye posteriores');
ok(JSON.stringify(cascadeEtapas('completado')) === JSON.stringify(['completado']), 'cascada de completado es solo ella');

// --- computeFlujoRows ---
const rows = computeFlujoRows({
  confirmaciones: [{ etapa: 'ingenieria', confirmada_por: 'Juan', confirmada_at: '2026-06-01' }],
  materiales: matsParcial,
});
ok(rows[0].status === 'confirmada' && rows[0].confirmadaPor === 'Juan', 'fila ingeniería confirmada con autor');
ok(rows[1].status === 'faltan_datos', 'logística: ingeniería firmada + materiales parciales → faltan_datos');
ok(rows[2].status === 'esperando', 'producción: logística sin firmar → esperando');

console.log(`\n===== ${pass} OK / ${fail} fallos =====`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx tsx scripts/test-flujo-confirmaciones.ts`
Expected: FAIL — error de import "computeReadiness is not exported" (aún no existe).

- [ ] **Step 3: Implementar las funciones puras**

En `lib/utils/estado-proyecto.ts`, añadir al final del archivo:

```typescript
// ---------------------------------------------------------------------------
// Confirmación manual de etapas (sign-off)
// ---------------------------------------------------------------------------

export type EtapaFlujo = 'ingenieria' | 'logistica' | 'produccion' | 'pruebas' | 'completado';

export const FLOW_ETAPAS: EtapaFlujo[] = ['ingenieria', 'logistica', 'produccion', 'pruebas', 'completado'];

export const ETAPA_LABEL: Record<EtapaFlujo, string> = {
  ingenieria: 'Ingeniería',
  logistica: 'Logística',
  produccion: 'Producción',
  pruebas: 'Pruebas',
  completado: 'Completado',
};

/** Permiso requerido para firmar/deshacer cada etapa. */
export const permForEtapa = (
  etapa: EtapaFlujo
): 'canEditIngenieria' | 'canEditLogistica' | 'canEditProduccion' =>
  etapa === 'ingenieria' ? 'canEditIngenieria'
  : etapa === 'logistica' ? 'canEditLogistica'
  : 'canEditProduccion';

export interface FlujoInput {
  confirmaciones?: { etapa: string; confirmada_por?: string | null; confirmada_at?: string | null }[];
  documentos?: { estado?: string | null }[];
  materiales?: { estado?: string | null }[];
  etapas?: { estado?: string | null }[];
}

const confirmadasSet = (input: FlujoInput): Set<EtapaFlujo> =>
  new Set((input.confirmaciones ?? []).map((c) => c.etapa as EtapaFlujo));

/** ¿Está cada etapa lista para firmar? (etapa anterior firmada + datos del área listos) */
export const computeReadiness = (input: FlujoInput): Record<EtapaFlujo, boolean> => {
  const c = confirmadasSet(input);
  const planos = planosAprobados(input.documentos);
  const mats = input.materiales ?? [];
  const materialesOk = mats.length > 0 && mats.every((m) => m.estado === 'COMPLETO');
  const etps = input.etapas ?? [];
  const etapasOk = etps.length > 0 && etps.every((e) => e.estado === 'COMPLETADO');

  return {
    ingenieria: planos,
    logistica: c.has('ingenieria') && materialesOk,
    produccion: c.has('logistica') && etapasOk,
    pruebas: c.has('produccion'),
    completado: c.has('pruebas'),
  };
};

/** Estado del proyecto a partir del conjunto de etapas firmadas. */
export const computeEstadoFromConfirmaciones = (confirmadas: Set<EtapaFlujo>): EstadoProyecto => {
  if (confirmadas.has('completado')) return 'COMPLETADO';
  if (confirmadas.has('produccion') || confirmadas.has('pruebas')) return 'LISTO PARA PRUEBAS';
  if (confirmadas.has('logistica')) return 'EN PRODUCCIÓN';
  if (confirmadas.has('ingenieria')) return 'COMPRAS EN CURSO';
  return 'EN INGENIERÍA';
};

/** La etapa dada y todas las posteriores (para el deshacer en cascada). */
export const cascadeEtapas = (etapa: EtapaFlujo): EtapaFlujo[] =>
  FLOW_ETAPAS.slice(FLOW_ETAPAS.indexOf(etapa));

export type FilaFlujoStatus = 'confirmada' | 'lista' | 'faltan_datos' | 'esperando';

export interface FilaFlujo {
  etapa: EtapaFlujo;
  label: string;
  status: FilaFlujoStatus;
  detalle: string;
  confirmadaPor: string | null;
  confirmadaAt: string | null;
}

/** Filas para el panel verificador: estado + texto de detalle por etapa. */
export const computeFlujoRows = (input: FlujoInput): FilaFlujo[] => {
  const c = confirmadasSet(input);
  const ready = computeReadiness(input);
  const mats = input.materiales ?? [];
  const matComprados = mats.filter((m) => m.estado === 'COMPLETO').length;
  const etps = input.etapas ?? [];
  const etpDone = etps.filter((e) => e.estado === 'COMPLETADO').length;

  const detalleFor = (etapa: EtapaFlujo, status: FilaFlujoStatus): string => {
    if (etapa === 'ingenieria') {
      if (status === 'lista') return 'Planos aprobados';
      if (status === 'faltan_datos') return 'Falta un plano "Aprobados y firmados"';
      return '';
    }
    if (etapa === 'logistica') {
      if (status === 'esperando') return 'Esperando Ingeniería';
      if (mats.length === 0) return 'Sin materiales cargados';
      return `Materiales ${matComprados}/${mats.length} comprados`;
    }
    if (etapa === 'produccion') {
      if (status === 'esperando') return 'Esperando Logística';
      if (etps.length === 0) return 'Sin etapas cargadas';
      return `Etapas ${etpDone}/${etps.length} completadas`;
    }
    if (etapa === 'pruebas') {
      return status === 'esperando' ? 'Esperando Producción' : 'Lista para confirmar';
    }
    return status === 'esperando' ? 'Esperando Pruebas' : 'Lista para confirmar';
  };

  return FLOW_ETAPAS.map((etapa, i) => {
    const conf = (input.confirmaciones ?? []).find((x) => x.etapa === etapa);
    let status: FilaFlujoStatus;
    if (c.has(etapa)) status = 'confirmada';
    else {
      const prevOk = i === 0 || c.has(FLOW_ETAPAS[i - 1]);
      if (!prevOk) status = 'esperando';
      else status = ready[etapa] ? 'lista' : 'faltan_datos';
    }
    return {
      etapa,
      label: ETAPA_LABEL[etapa],
      status,
      detalle: detalleFor(etapa, status),
      confirmadaPor: conf?.confirmada_por ?? null,
      confirmadaAt: conf?.confirmada_at ?? null,
    };
  });
};
```

> Nota: `planosAprobados` y `EstadoProyecto` ya existen en el archivo; reusarlos (no redefinir).

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npx tsx scripts/test-flujo-confirmaciones.ts`
Expected: `===== 18 OK / 0 fallos =====`

- [ ] **Step 5: Commit**

```bash
git add lib/utils/estado-proyecto.ts scripts/test-flujo-confirmaciones.ts
git commit -m "feat: funciones puras de confirmacion de etapas + tests"
```

---

## Task 4: API — acciones confirmar/deshacer y estado desde confirmaciones

**Files:**
- Modify: `app/api/proyectos/[id]/route.ts`
- Modify: `app/api/proyectos/route.ts`

- [ ] **Step 1: Importar las nuevas funciones en el route del detalle**

En `app/api/proyectos/[id]/route.ts`, reemplazar la línea de import de estado-proyecto:

```typescript
import { computeEstadoProyecto, aplicarRetraso } from '@/lib/utils/estado-proyecto';
```

por:

```typescript
import {
  aplicarRetraso,
  computeEstadoFromConfirmaciones,
  computeReadiness,
  cascadeEtapas,
  permForEtapa,
  FLOW_ETAPAS,
  type EtapaFlujo,
} from '@/lib/utils/estado-proyecto';
```

- [ ] **Step 2: GET detalle — incluir confirmaciones y derivar estado**

En `app/api/proyectos/[id]/route.ts`, dentro del `GET`, añadir `proyecto_confirmaciones` al `Promise.all` (al final del array, tras `documentos`):

```typescript
      supabase.from('proyecto_confirmaciones').select('*').eq('proyecto_id', id),
```

y actualizar la desestructuración para incluir `confirmaciones`:

```typescript
    const [comercial, ingenieria, materiales, produccion, etapas, finanzas, pagos, comentarios, observaciones, documentos, confirmaciones] = await Promise.all([
```

Añadir al objeto `fullProyecto` (tras `documentos: documentos.data || [],`):

```typescript
      confirmaciones: confirmaciones.data || [],
```

Reemplazar el bloque del overlay de estado:

```typescript
    // Overlay RETRASADO según la fecha de entrega (se calcula al leer)
    const hoy = new Date().toISOString().split('T')[0];
    fullProyecto.estado = aplicarRetraso(proyecto.estado, comercial.data?.fecha_entrega, hoy);
```

por (el estado ahora se deriva de las firmas):

```typescript
    // Estado derivado de las firmas de etapa + overlay RETRASADO al leer
    const hoy = new Date().toISOString().split('T')[0];
    const confirmadas = new Set((confirmaciones.data ?? []).map((c) => c.etapa as EtapaFlujo));
    const estadoBase = computeEstadoFromConfirmaciones(confirmadas);
    fullProyecto.estado = aplicarRetraso(estadoBase, comercial.data?.fecha_entrega, hoy);
```

- [ ] **Step 3: PATCH — permiso de las acciones nuevas**

En `app/api/proyectos/[id]/route.ts`, dentro del `PATCH`, añadir al array `requiere` (los permisos de confirmar/deshacer se validan por-etapa más abajo, pero se rechaza temprano si la etapa es inválida). Insertar después de la última entrada del array `requiere`, dejar el array igual y añadir DESPUÉS del `for (const [enviado, perm] of requiere)` el siguiente bloque helper:

```typescript
    // Confirmar una etapa del flujo (sign-off)
    if (body.confirmarEtapa?.etapa) {
      const etapa = body.confirmarEtapa.etapa as EtapaFlujo;
      if (!FLOW_ETAPAS.includes(etapa)) {
        return NextResponse.json({ error: 'Etapa inválida' }, { status: 400 });
      }
      if (!can(permForEtapa(etapa))) {
        return NextResponse.json({ error: `Sin permiso para firmar ${etapa}` }, { status: 403 });
      }
      // Revalidar readiness desde la BD (no confiar en el cliente)
      const [docsR, matsR, etpsR, confsR] = await Promise.all([
        supabase.from('proyecto_documentos').select('estado').eq('proyecto_id', id),
        supabase.from('proyecto_materiales').select('estado').eq('proyecto_id', id),
        supabase.from('proyecto_etapas').select('estado').eq('proyecto_id', id),
        supabase.from('proyecto_confirmaciones').select('etapa').eq('proyecto_id', id),
      ]);
      const ready = computeReadiness({
        confirmaciones: confsR.data ?? [],
        documentos: docsR.data ?? [],
        materiales: matsR.data ?? [],
        etapas: etpsR.data ?? [],
      });
      if (!ready[etapa]) {
        return NextResponse.json(
          { error: 'La etapa no está lista para confirmar', code: 'NOT_READY' },
          { status: 409 }
        );
      }
      await supabase.from('proyecto_confirmaciones').upsert(
        { proyecto_id: id, etapa, confirmada_por: autor, confirmada_at: now },
        { onConflict: 'proyecto_id,etapa' }
      );
    }

    // Deshacer una etapa (y las posteriores, en cascada)
    if (body.deshacerEtapa?.etapa) {
      const etapa = body.deshacerEtapa.etapa as EtapaFlujo;
      if (!FLOW_ETAPAS.includes(etapa)) {
        return NextResponse.json({ error: 'Etapa inválida' }, { status: 400 });
      }
      if (!can(permForEtapa(etapa))) {
        return NextResponse.json({ error: `Sin permiso para deshacer ${etapa}` }, { status: 403 });
      }
      await supabase
        .from('proyecto_confirmaciones')
        .delete()
        .eq('proyecto_id', id)
        .in('etapa', cascadeEtapas(etapa));
    }
```

- [ ] **Step 4: PATCH — recomputar estado desde confirmaciones**

En `app/api/proyectos/[id]/route.ts`, reemplazar el bloque final de recálculo de estado:

```typescript
    // Estado automático: recalcular desde el avance real de las áreas y persistir.
    // Planos = documentos (versiones); aprobado si alguno está "Aprobados y firmados".
    const [docs, mats, etps, prod] = await Promise.all([
      supabase.from('proyecto_documentos').select('estado').eq('proyecto_id', id),
      supabase.from('proyecto_materiales').select('estado').eq('proyecto_id', id),
      supabase.from('proyecto_etapas').select('estado').eq('proyecto_id', id),
      supabase.from('proyecto_produccion').select('pruebas, envio').eq('proyecto_id', id).maybeSingle(),
    ]);
    const nuevoEstado = computeEstadoProyecto({
      documentos: docs.data ?? [],
      materiales: mats.data ?? [],
      etapas: etps.data ?? [],
      pruebas: prod.data?.pruebas,
      envio: prod.data?.envio,
    });
    await supabase.from('proyectos').update({ estado: nuevoEstado, updated_at: now }).eq('id', id);

    return NextResponse.json({ success: true, estado: nuevoEstado });
```

por:

```typescript
    // Estado manual: se deriva de las firmas de etapa (no de los datos crudos).
    const { data: confsAll } = await supabase
      .from('proyecto_confirmaciones')
      .select('etapa')
      .eq('proyecto_id', id);
    const confirmadasAll = new Set((confsAll ?? []).map((c) => c.etapa as EtapaFlujo));
    const nuevoEstado = computeEstadoFromConfirmaciones(confirmadasAll);
    await supabase.from('proyectos').update({ estado: nuevoEstado, updated_at: now }).eq('id', id);

    return NextResponse.json({ success: true, estado: nuevoEstado });
```

- [ ] **Step 5: GET lista — embeber confirmaciones y derivar estado**

En `app/api/proyectos/route.ts`, reemplazar el import:

```typescript
import { aplicarRetraso } from '@/lib/utils/estado-proyecto';
```

por:

```typescript
import { aplicarRetraso, computeEstadoFromConfirmaciones, type EtapaFlujo } from '@/lib/utils/estado-proyecto';
```

Reemplazar el `.select(...)` de la query de lista:

```typescript
      .select(`
        *,
        proyecto_comercial (fecha_entrega, dias_plazo, adelanto, adelanto_fijado, metrado, alerta),
        proyecto_produccion (progreso)
      `)
```

por:

```typescript
      .select(`
        *,
        proyecto_comercial (fecha_entrega, dias_plazo, adelanto, adelanto_fijado, metrado, alerta),
        proyecto_produccion (progreso),
        proyecto_confirmaciones (etapa, confirmada_por, confirmada_at)
      `)
```

Reemplazar el `.map(...)`:

```typescript
    const formatted = proyectos.map((p) => {
      const comercial = one(p.proyecto_comercial);
      const produccion = one(p.proyecto_produccion);
      return {
        ...p,
        estado: aplicarRetraso(p.estado, comercial?.fecha_entrega, hoy),
        comercial,
        produccion,
        proyecto_comercial: undefined,
        proyecto_produccion: undefined,
      };
    });
```

por:

```typescript
    const formatted = proyectos.map((p) => {
      const comercial = one(p.proyecto_comercial);
      const produccion = one(p.proyecto_produccion);
      const confirmaciones = Array.isArray(p.proyecto_confirmaciones) ? p.proyecto_confirmaciones : [];
      const confirmadas = new Set(confirmaciones.map((c: { etapa: string }) => c.etapa as EtapaFlujo));
      const estadoBase = computeEstadoFromConfirmaciones(confirmadas);
      return {
        ...p,
        estado: aplicarRetraso(estadoBase, comercial?.fecha_entrega, hoy),
        comercial,
        produccion,
        confirmaciones,
        proyecto_comercial: undefined,
        proyecto_produccion: undefined,
        proyecto_confirmaciones: undefined,
      };
    });
```

- [ ] **Step 6: Verificar compilación**

Run: `npm run build`
Expected: build exitoso (sin errores de tipo). Nota: `computeEstadoProyecto` deja de usarse en estos archivos; sigue exportada para los tests viejos hasta la Task 9.

- [ ] **Step 7: Commit**

```bash
git add app/api/proyectos/[id]/route.ts app/api/proyectos/route.ts
git commit -m "feat: API confirmar/deshacer etapa + estado desde firmas"
```

---

## Task 5: E2E de la API (flujo completo)

**Files:**
- Create: `scripts/e2e-confirmaciones.mjs`

- [ ] **Step 1: Escribir el E2E**

Crear `scripts/e2e-confirmaciones.mjs`:

```javascript
// E2E del flujo de confirmaciones contra la API real. Requiere el server en :3000.
import { getAuthCookie, serviceClient } from './lib/supabase-test.mjs';
const BASE = 'http://localhost:3000';
const cookie = await getAuthCookie('admin@bbti.com.pe', 'admin2024');
const svc = serviceClient();
const H = { 'Content-Type': 'application/json', cookie };
let pass = 0, fail = 0;
const expect = (cond, msg) => { console.log((cond ? 'OK  ' : 'XX  ') + msg); cond ? pass++ : fail++; };
const getEstado = async (id) => (await (await fetch(`${BASE}/api/proyectos/${id}`, { headers: { cookie } })).json()).estado;
const confirmar = (id, etapa) => fetch(`${BASE}/api/proyectos/${id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ confirmarEtapa: { etapa } }) });
const deshacer = (id, etapa) => fetch(`${BASE}/api/proyectos/${id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ deshacerEtapa: { etapa } }) });

// Crear proyecto
const proy = await (await fetch(`${BASE}/api/proyectos`, { method: 'POST', headers: H,
  body: JSON.stringify({ cliente: 'PRUEBA SIGNOFF SAC', monto: 50000, fecha_entrega: '2026-12-31', dias_plazo: 60, adelanto: 15000 }) })).json();
const id = proy.id;
expect(proy.estado === 'EN INGENIERÍA', '① crear → EN INGENIERÍA');

// ② Confirmar Logística antes que Ingeniería → 409
const r1 = await confirmar(id, 'logistica');
expect(r1.status === 409, '② confirmar logística sin ingeniería → 409');

// ③ Aprobar plano + confirmar Ingeniería
await svc.from('proyecto_documentos').insert({ proyecto_id: id, nombre: 'plano_v1.pdf', estado: 'Aprobados y firmados' });
const r2 = await confirmar(id, 'ingenieria');
expect(r2.status === 200, '③ confirmar ingeniería → 200');
expect(await getEstado(id) === 'COMPRAS EN CURSO', '③ estado → COMPRAS EN CURSO');

// ④ Materiales COMPLETO + confirmar Logística
await fetch(`${BASE}/api/proyectos/${id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ materiales: [
  { nombre: 'Interruptor', cantidad: 5, unidad: 'und', comprado: 5, estado: 'COMPLETO' } ] }) });
await confirmar(id, 'logistica');
expect(await getEstado(id) === 'EN PRODUCCIÓN', '④ logística firmada → EN PRODUCCIÓN');

// ⑤ Etapas COMPLETADO + confirmar Producción
const { data: etapas } = await svc.from('proyecto_etapas').select('id').eq('proyecto_id', id);
await fetch(`${BASE}/api/proyectos/${id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ etapas: etapas.map(e => ({ id: e.id, estado: 'COMPLETADO' })) }) });
await confirmar(id, 'produccion');
expect(await getEstado(id) === 'LISTO PARA PRUEBAS', '⑤ producción firmada → LISTO PARA PRUEBAS');

// ⑥ Pruebas + Completado
await confirmar(id, 'pruebas');
await confirmar(id, 'completado');
expect(await getEstado(id) === 'COMPLETADO', '⑥ completado firmado → COMPLETADO');

// ⑦ Deshacer Logística (cascada) → vuelve a COMPRAS EN CURSO
await deshacer(id, 'logistica');
expect(await getEstado(id) === 'COMPRAS EN CURSO', '⑦ deshacer logística (cascada) → COMPRAS EN CURSO');
const { data: restantes } = await svc.from('proyecto_confirmaciones').select('etapa').eq('proyecto_id', id);
expect(restantes.length === 1 && restantes[0].etapa === 'ingenieria', '⑦ solo queda ingeniería firmada');

// ⑧ Permisos: rol Logística NO puede confirmar Producción
//   (rehacer logística como admin, luego intentar producción con cookie de logística)
await confirmar(id, 'logistica');
const cookieLog = await getAuthCookie('logistica@bbti.com.pe', 'carlosr');
const r8 = await fetch(`${BASE}/api/proyectos/${id}`, { method: 'PATCH',
  headers: { 'Content-Type': 'application/json', cookie: cookieLog },
  body: JSON.stringify({ confirmarEtapa: { etapa: 'produccion' } }) });
expect(r8.status === 403, '⑧ rol Logística confirma Producción → 403');

// Limpieza
await svc.from('proyectos').delete().eq('id', id);
console.log(`\n===== ${pass} OK / ${fail} fallos ===== (limpiado ${id})`);
process.exit(fail ? 1 : 0);
```

> Nota: credenciales del usuario Logística verificadas en `scripts/seed.ts` (`logistica@bbti.com.pe` / `carlosr`). El objetivo del caso ⑧ es usar un rol que NO sea dueño de la etapa que se intenta firmar (Logística intentando firmar Producción → 403).

- [ ] **Step 2: Reconstruir y reiniciar el server de producción**

Run: `npm run build`
Expected: build exitoso.

Run (en una terminal aparte / background): `npx kill-port 3000; npm start`
Esperar a que `http://localhost:3000/login` responda 200.

- [ ] **Step 3: Correr el E2E**

Run: `node scripts/e2e-confirmaciones.mjs`
Expected: `===== 10 OK / 0 fallos =====`

- [ ] **Step 4: Commit**

```bash
git add scripts/e2e-confirmaciones.mjs
git commit -m "test: e2e del flujo de confirmaciones (sign-off)"
```

---

## Task 6: Panel `FlujoVerificacion` + stepper + detalle

**Files:**
- Create: `components/proyectos/FlujoVerificacion.tsx`
- Modify: `components/proyectos/EstadoStepper.tsx`
- Modify: `app/(dashboard)/proyectos/[id]/page.tsx`

- [ ] **Step 1: Crear el componente del panel**

Crear `components/proyectos/FlujoVerificacion.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Check, Loader2, CircleDashed, AlertCircle, Undo2 } from 'lucide-react';
import type { Proyecto } from '@/types';
import { useAppStore } from '@/store/appStore';
import { can } from '@/lib/auth/permissions';
import { computeFlujoRows, permForEtapa, type EtapaFlujo } from '@/lib/utils/estado-proyecto';
import { cn } from '@/lib/utils';

interface Props {
  proyecto: Proyecto;
  onUpdate: (p: Proyecto) => void;
}

/** Panel verificador: confirma/deshace cada etapa del flujo (sign-off manual). */
export const FlujoVerificacion = ({ proyecto, onUpdate }: Props) => {
  const { user } = useAppStore();
  const [busy, setBusy] = useState<EtapaFlujo | null>(null);

  const rows = computeFlujoRows({
    confirmaciones: proyecto.confirmaciones,
    documentos: proyecto.documentos,
    materiales: proyecto.logistica?.materiales,
    etapas: proyecto.produccion?.etapas,
  });

  const refetch = async () => {
    const res = await fetch(`/api/proyectos/${proyecto.id}`);
    if (res.ok) onUpdate(await res.json());
  };

  const accion = async (etapa: EtapaFlujo, tipo: 'confirmar' | 'deshacer') => {
    setBusy(etapa);
    try {
      const body = tipo === 'confirmar' ? { confirmarEtapa: { etapa } } : { deshacerEtapa: { etapa } };
      const res = await fetch(`/api/proyectos/${proyecto.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) await refetch();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="bg-[var(--navy2)] rounded-xl border border-slate-800 p-5">
      <h3 className="text-sm font-semibold text-slate-300 mb-4">Verificación del flujo</h3>
      <div className="space-y-2">
        {rows.map((row, i) => {
          const puede = can(user, permForEtapa(row.etapa));
          const loading = busy === row.etapa;
          return (
            <div
              key={row.etapa}
              className="flex items-center gap-3 p-3 rounded-lg border border-slate-700 bg-slate-800/30"
            >
              {/* Ícono de estado */}
              <span className="shrink-0">
                {row.status === 'confirmada' ? (
                  <Check className="w-5 h-5 text-green-400" />
                ) : row.status === 'lista' ? (
                  <CircleDashed className="w-5 h-5 text-blue-400" />
                ) : row.status === 'faltan_datos' ? (
                  <AlertCircle className="w-5 h-5 text-amber-400" />
                ) : (
                  <CircleDashed className="w-5 h-5 text-slate-600" />
                )}
              </span>

              {/* Nombre + detalle */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">
                  {i + 1}. {row.label}
                </p>
                <p
                  className={cn(
                    'text-xs',
                    row.status === 'confirmada' ? 'text-green-400/80'
                    : row.status === 'lista' ? 'text-blue-400/80'
                    : row.status === 'faltan_datos' ? 'text-amber-400/80'
                    : 'text-slate-500'
                  )}
                >
                  {row.status === 'confirmada'
                    ? `Confirmada${row.confirmadaPor ? ' · ' + row.confirmadaPor : ''}${row.confirmadaAt ? ' · ' + row.confirmadaAt.split('T')[0] : ''}`
                    : row.detalle}
                </p>
              </div>

              {/* Acción */}
              <div className="shrink-0">
                {row.status === 'confirmada' ? (
                  puede ? (
                    <button
                      onClick={() => accion(row.etapa, 'deshacer')}
                      disabled={loading}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Undo2 className="w-3.5 h-3.5" />}
                      Deshacer
                    </button>
                  ) : null
                ) : row.status === 'lista' ? (
                  puede ? (
                    <button
                      onClick={() => accion(row.etapa, 'confirmar')}
                      disabled={loading}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors disabled:opacity-50"
                    >
                      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      Confirmar
                    </button>
                  ) : (
                    <span className="text-xs text-slate-500">Pendiente</span>
                  )
                ) : (
                  <span className="text-xs text-slate-600">—</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Actualizar `EstadoStepper` para usar confirmaciones**

En `components/proyectos/EstadoStepper.tsx`, reemplazar el import:

```typescript
import { computeFlow, activeStageIndex, FLOW_STAGES } from '@/lib/utils/estado-proyecto';
```

por:

```typescript
import { FLOW_STAGES, FLOW_ETAPAS, type EtapaFlujo } from '@/lib/utils/estado-proyecto';
```

y reemplazar el cuerpo que calcula `flow/done/active`:

```typescript
  const flow = computeFlow({
    documentos: proyecto.documentos,
    materiales: proyecto.logistica?.materiales,
    etapas: proyecto.produccion?.etapas,
    pruebas: proyecto.produccion?.pruebas,
    envio: proyecto.produccion?.envio,
  });
  const done = [flow.ingenieria, flow.logistica, flow.produccion, flow.pruebas, flow.completado];
  const active = activeStageIndex(flow);
```

por:

```typescript
  const confirmadas = new Set((proyecto.confirmaciones ?? []).map((c) => c.etapa as EtapaFlujo));
  const done = FLOW_ETAPAS.map((e) => confirmadas.has(e));
  const firstPending = done.indexOf(false);
  const active = firstPending === -1 ? FLOW_STAGES.length : firstPending;
```

> `FLOW_STAGES` (labels) y `FLOW_ETAPAS` (claves) están en el mismo orden, así que `done[i]` corresponde a `FLOW_STAGES[i]`.

- [ ] **Step 3: Renderizar el panel en la página de detalle**

En `app/(dashboard)/proyectos/[id]/page.tsx`, añadir el import:

```typescript
import { FlujoVerificacion } from '@/components/proyectos/FlujoVerificacion';
```

y debajo de `<EstadoStepper proyecto={proyecto} />` añadir:

```tsx
      {/* Verificador del flujo (firmas de etapa) */}
      <FlujoVerificacion proyecto={proyecto} onUpdate={setProyecto} />
```

- [ ] **Step 4: Build y verificación visual**

Run: `npm run build`
Expected: build exitoso.

Run: `npx kill-port 3000; npm start` (esperar 200 en `/login`).

Verificación manual: entrar a un proyecto, ver el panel "Verificación del flujo" bajo el stepper; confirmar Ingeniería (con un plano aprobado) y comprobar que el stepper avanza y el estado cambia a COMPRAS EN CURSO; probar Deshacer.

- [ ] **Step 5: Commit**

```bash
git add components/proyectos/FlujoVerificacion.tsx components/proyectos/EstadoStepper.tsx "app/(dashboard)/proyectos/[id]/page.tsx"
git commit -m "feat: panel FlujoVerificacion + stepper desde confirmaciones"
```

---

## Task 7: Limpiar `TabProduccion` (quitar checkboxes pruebas/envío)

**Files:**
- Modify: `components/proyectos/tabs/TabProduccion.tsx`

- [ ] **Step 1: Quitar estado y checkboxes de pruebas/envío; persistir progreso al cambiar etapa**

En `components/proyectos/tabs/TabProduccion.tsx`:

1. Eliminar los `useState` de `pruebas`, `envio` y `saving`, y el `useEffect` que los sincroniza. Mantener `updatingEtapa`.

2. Reemplazar `handleEtapaChange` por una versión que también persiste el progreso recalculado:

```tsx
  const handleEtapaChange = async (etapaId: string, estado: EstadoEtapa) => {
    setUpdatingEtapa(etapaId);
    try {
      const nuevasEtapas = etapas.map((e) => (e.id === etapaId ? { ...e, estado } : e));
      const nuevoProgreso = nuevasEtapas.length > 0
        ? Math.round((nuevasEtapas.filter((e) => e.estado === 'COMPLETADO').length / nuevasEtapas.length) * 100)
        : 0;
      const res = await fetch(`/api/proyectos/${proyecto.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ etapas: [{ id: etapaId, estado }], produccion: { progreso: nuevoProgreso } }),
      });
      if (res.ok) await refetch();
    } finally {
      setUpdatingEtapa(null);
    }
  };
```

3. Eliminar la función `handleSave`.

4. Eliminar del JSX el bloque `{/* Checkboxes */}` completo (las dos `<label>` de "Pruebas completadas" y "Listo para envío") y el botón `{canEdit && (<button onClick={handleSave}...>Guardar</button>)}`.

5. Eliminar los imports que queden sin uso (`Save`). Mantener `CheckCircle2, Circle, Loader2`.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: build exitoso, sin warnings de imports/variables sin usar.

- [ ] **Step 3: Commit**

```bash
git add components/proyectos/tabs/TabProduccion.tsx
git commit -m "refactor: quitar checkboxes pruebas/envio de TabProduccion (ahora se firman en el panel)"
```

---

## Task 8: Backfill de proyectos existentes

**Files:**
- Create: `scripts/backfill-confirmaciones.ts`

- [ ] **Step 1: Escribir el script de backfill**

Crear `scripts/backfill-confirmaciones.ts`:

```typescript
// Backfill: infiere las firmas de etapa de proyectos existentes desde su avance actual.
// Ejecutar: npx tsx --env-file=.env.local scripts/backfill-confirmaciones.ts
import { serviceClient } from './lib/supabase-test.mjs';
import { computeFlow, computeEstadoFromConfirmaciones, FLOW_ETAPAS, type EtapaFlujo } from '../lib/utils/estado-proyecto';

const svc = serviceClient();
const AUTOR = 'Sistema (migración)';

const { data: proyectos, error } = await svc.from('proyectos').select('id');
if (error) { console.error(error.message); process.exit(1); }

let total = 0, firmasInsertadas = 0;
for (const { id } of proyectos ?? []) {
  total++;
  const [docs, mats, etps, prod] = await Promise.all([
    svc.from('proyecto_documentos').select('estado').eq('proyecto_id', id),
    svc.from('proyecto_materiales').select('estado').eq('proyecto_id', id),
    svc.from('proyecto_etapas').select('estado').eq('proyecto_id', id),
    svc.from('proyecto_produccion').select('pruebas, envio').eq('proyecto_id', id).maybeSingle(),
  ]);
  const flow = computeFlow({
    documentos: docs.data ?? [],
    materiales: mats.data ?? [],
    etapas: etps.data ?? [],
    pruebas: prod.data?.pruebas,
    envio: prod.data?.envio,
  });
  const firmadas: EtapaFlujo[] = [];
  if (flow.ingenieria) firmadas.push('ingenieria');
  if (flow.logistica) firmadas.push('logistica');
  if (flow.produccion) firmadas.push('produccion');
  if (flow.pruebas) firmadas.push('pruebas');
  if (flow.completado) firmadas.push('completado');

  if (firmadas.length > 0) {
    const rows = firmadas.map((etapa) => ({ proyecto_id: id, etapa, confirmada_por: AUTOR }));
    await svc.from('proyecto_confirmaciones').upsert(rows, { onConflict: 'proyecto_id,etapa' });
    firmasInsertadas += firmadas.length;
  }
  // Persistir el estado derivado de las firmas
  const estado = computeEstadoFromConfirmaciones(new Set(firmadas));
  await svc.from('proyectos').update({ estado }).eq('id', id);
  console.log(`${id}: [${firmadas.join(', ') || 'ninguna'}] → ${estado}`);
}
console.log(`\n${total} proyectos procesados, ${firmasInsertadas} firmas insertadas.`);
process.exit(0);
```

> `FLOW_ETAPAS` se importa aunque no se use directamente — eliminarlo del import si el linter se queja; lo relevante es `computeFlow`, `computeEstadoFromConfirmaciones`, `EtapaFlujo`.

- [ ] **Step 2: Ejecutar el backfill**

Run: `npx tsx --env-file=.env.local scripts/backfill-confirmaciones.ts`
Expected: una línea por proyecto mostrando las etapas firmadas y el estado resultante; al final el resumen.

- [ ] **Step 3: Verificar en la app**

Refrescar la lista de proyectos y un detalle: los proyectos que ya tenían avance deben mostrar sus etapas firmadas por "Sistema (migración)" y el estado correcto.

- [ ] **Step 4: Commit**

```bash
git add scripts/backfill-confirmaciones.ts
git commit -m "chore: script de backfill de confirmaciones para proyectos existentes"
```

---

## Task 9: Regresión y limpieza

**Files:**
- Delete: `scripts/test-flujo-estado.mjs`
- Modify: `scripts/test-estado-proyecto.ts` (mantener solo lo que sigue vigente)

- [ ] **Step 1: Reemplazar el test viejo de flujo basado en datos**

El estado ya no se deriva de datos en el PATCH, así que `scripts/test-flujo-estado.mjs` (que esperaba avance automático) quedó obsoleto. Eliminarlo:

```bash
git rm scripts/test-flujo-estado.mjs
```

El nuevo `scripts/e2e-confirmaciones.mjs` lo reemplaza.

- [ ] **Step 2: Revisar `scripts/test-estado-proyecto.ts`**

`computeEstadoProyecto` / `computeFlow` siguen exportadas y se usan en el backfill, así que `scripts/test-estado-proyecto.ts` sigue siendo válido. Correrlo para confirmar:

Run: `npx tsx scripts/test-estado-proyecto.ts`
Expected: todos OK (sin cambios).

- [ ] **Step 3: Correr el sweep de páginas (8 páginas sin errores)**

Asegurar el server de producción corriendo en :3000 (build + start si hubo cambios).

Run: `node scripts/e2e-sweep.mjs`
Expected: 8 páginas, 0 errores de consola. El detalle de proyecto renderiza el panel nuevo sin errores.

- [ ] **Step 4: Correr la suite de tests del flujo nuevo**

Run: `npx tsx scripts/test-flujo-confirmaciones.ts`
Expected: `18 OK / 0 fallos`.

Run: `node scripts/e2e-confirmaciones.mjs`
Expected: `10 OK / 0 fallos`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test: reemplazar test de flujo por datos con el de confirmaciones; regresion verde"
```

---

## Self-Review (verificado al escribir el plan)

- **Cobertura del spec:** tabla+RLS (T1), tipos (T2), funciones puras readiness/estado/cascada/rows (T3), API confirmar/deshacer + GET lista/detalle (T4), E2E con 409/403/cascada (T5), panel+stepper+detalle (T6), deprecación de checkboxes (T7), backfill (T8), regresión (T9). El tema Gerencia queda cubierto por `permForEtapa` (solo `canEdit*`, sin caso especial) — coherente con el spec.
- **Sin placeholders:** todo el código va completo en cada paso.
- **Consistencia de tipos:** `EtapaFlujo`, `FLOW_ETAPAS`, `ETAPA_LABEL`, `permForEtapa`, `computeReadiness`, `computeEstadoFromConfirmaciones`, `cascadeEtapas`, `computeFlujoRows`, `FilaFlujo` se definen en T3 y se usan con la misma firma en T4/T6/T8. `Proyecto.confirmaciones` (T2) se consume en API y componentes.
