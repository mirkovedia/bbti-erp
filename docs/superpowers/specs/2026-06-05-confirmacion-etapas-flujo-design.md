# Diseño: Confirmación manual de etapas del flujo (sign-off)

**Fecha:** 2026-06-05
**Proyecto:** BBTI ERP
**Estado:** Aprobado por el usuario (pendiente revisión del spec)

## Problema

El estado del proyecto (`EN INGENIERÍA → COMPRAS EN CURSO → EN PRODUCCIÓN → LISTO PARA PRUEBAS → COMPLETADO`)
hoy se **deriva automáticamente** de los datos crudos de cada área (`computeEstadoProyecto` en
`lib/utils/estado-proyecto.ts`, recalculado en cada `PATCH`). El `EstadoStepper` se mueve solo.

El mecanismo funciona pero es una **caja negra**: el usuario no ve *qué* condición avanza cada etapa,
ni *cuánto falta*, ni *quién* confirmó el avance. No hay un "verificador" explícito.

## Decisión

Pasar de avance **automático por datos** a **confirmación manual (sign-off)** por etapa:

1. El estado se deriva de las **firmas** de cada etapa, no de los datos crudos.
2. El botón "Confirmar etapa" se habilita **solo cuando los datos del área están listos**
   (gating por readiness). El cliente decide qué mostrar; el server decide qué permitir.
3. Confirma **el responsable del área + Admin** (reusa la matriz `PERMS`).
4. **Deshacer con cascada:** deshacer una etapa deshace las posteriores. Editar datos de un área ya
   firmada conserva la firma (no se invalida sola).

## Las 5 etapas del flujo

`ingenieria → logistica → produccion → pruebas → completado` (las mismas de `FLOW_STAGES`).
Cada una se vuelve firmable.

## Modelo de datos

### Migración `005_confirmaciones_flujo.sql`

```sql
create table if not exists proyecto_confirmaciones (
  proyecto_id    text not null references proyectos(id) on delete cascade,
  etapa          text not null check (etapa in
                   ('ingenieria','logistica','produccion','pruebas','completado')),
  confirmada_por text,                              -- nombre del usuario que firmó
  confirmada_at  timestamptz not null default now(),
  primary key (proyecto_id, etapa)
);
alter table proyecto_confirmaciones enable row level security;
-- Política de lectura para autenticados; escritura solo backend (service role bypassa RLS),
-- siguiendo el patrón de las demás tablas proyecto_*.
```

La **presencia de una fila = etapa firmada**. Ausencia = no firmada.
Confirmar = `upsert` de la fila. Deshacer = `delete` de la fila + las posteriores (cascada).

### Backfill — `scripts/backfill-confirmaciones.mjs`

Los proyectos existentes tienen estado derivado de datos. Sin firmas iniciales, todos volverían a
`EN INGENIERÍA`. El script recorre cada proyecto, reusa la lógica de readiness sobre los datos
actuales e inserta las firmas que ya correspondan (en cascada, en orden), con
`confirmada_por = 'Sistema (migración)'`. Así un proyecto que hoy está `EN PRODUCCIÓN` mantiene
firmadas Ingeniería y Logística.

### Flags deprecados

`produccion.pruebas` y `produccion.envio` quedan **deprecados** (las etapas Pruebas/Completado se
firman en el panel). Las columnas quedan en BD sin uso, igual que se hizo con `estado_planos`.
No se borran para no romper datos existentes.

## Lógica (funciones puras en `lib/utils/estado-proyecto.ts`)

### `computeReadiness(input): Readiness`

¿Se puede firmar cada etapa? Habilita/deshabilita el botón. Requiere etapa anterior **firmada** Y
datos del área listos.

| Etapa | Lista para firmar cuando… |
|-------|---------------------------|
| Ingeniería | algún documento está "Aprobados y firmados" |
| Logística | `ingenieria` firmada **y** todos los materiales `COMPLETO` |
| Producción | `logistica` firmada **y** todas las etapas `COMPLETADO` |
| Pruebas | `produccion` firmada (la firma *es* el "pruebas pasó") |
| Completado | `pruebas` firmada (la firma *es* el "enviado/entregado") |

Entrada: `{ confirmadas: Set<Etapa>, documentos, materiales, etapas }`.
Salida: `{ ingenieria, logistica, produccion, pruebas, completado }` (booleanos).

Para cada etapa, además, el detalle de "qué falta" se calcula para mostrarlo en el panel
(p.ej. materiales `comprados/total`, etapas `completadas/total`).

### `computeEstadoFromConfirmaciones(confirmadas): EstadoProyecto`

```
completado firmada              → COMPLETADO
produccion o pruebas firmada    → LISTO PARA PRUEBAS
logistica firmada               → EN PRODUCCIÓN
ingenieria firmada              → COMPRAS EN CURSO
ninguna                         → EN INGENIERÍA
```

`aplicarRetraso(estado, fechaEntrega, hoy)` sigue siendo overlay al leer, sin cambios.
`COMPLETADO` nunca es `RETRASADO`.

> Nota: Pruebas firmada (sin Completado) deja el estado en `LISTO PARA PRUEBAS` — no se agrega un
> nuevo valor al enum `EstadoProyecto`; la granularidad la lleva el stepper visual.

### `cascadeEtapas(etapa): Etapa[]`

Devuelve la etapa dada y todas las posteriores (para el delete del deshacer).

## API: `PATCH /api/proyectos/[id]`

Dos acciones nuevas:

```jsonc
{ "confirmarEtapa": { "etapa": "logistica" } }
{ "deshacerEtapa":  { "etapa": "logistica" } }
```

**Confirmar** (server-side, sin confiar en el cliente):
1. Validar **permiso** para la etapa (ver mapeo).
2. **Recomputar readiness desde la BD** (etapa anterior firmada + datos del área listos).
   Si no está lista → `409 Conflict`.
3. `upsert` de la fila con `confirmada_por = userData.nombre`, `confirmada_at = now()`.

**Deshacer:**
1. Validar permiso para la etapa.
2. `DELETE` de esa etapa y todas las posteriores (`cascadeEtapas`).

Al final (como hoy): recalcular el estado — ahora con `computeEstadoFromConfirmaciones` leyendo
`proyecto_confirmaciones` — y persistir en `proyectos.estado`.

### Mapeo de permisos por etapa

| Etapa | Permiso | Quién puede |
|-------|---------|-------------|
| `ingenieria` | `canEditIngenieria` | Ingeniería, Admin |
| `logistica` | `canEditLogistica` | Logística, Admin |
| `produccion` / `pruebas` / `completado` | `canEditProduccion` | Producción, Admin |

**Decisión sobre Gerencia General:** la matriz `PERMS` actual le da a Gerencia **solo lectura**
(ningún `canEdit*`). Se mantiene coherente: **Gerencia NO firma**; firman Admin + el rol del área.
(Si en el futuro se quiere que Gerencia selle, se agrega un caso especial de una línea en la
validación de permisos.)

### GET (detalle y lista)

`GET /api/proyectos/[id]` y `GET /api/proyectos`:
- Incluir las `confirmaciones` del proyecto (las del id en detalle; embebidas/normalizadas en lista).
- Derivar `estado` con `computeEstadoFromConfirmaciones` + overlay `aplicarRetraso`.

## UI

### Componente `components/proyectos/FlujoVerificacion.tsx`

Renderizado bajo `EstadoStepper` en `app/(dashboard)/proyectos/[id]/page.tsx`, visible siempre
(fuera de las pestañas). Una fila por etapa con 4 estados:

```
┌─ Verificación del flujo ─────────────────────────────────────────┐
│ ✓ 1. Ingeniería    Confirmada · Juan P. · 01/06       [Deshacer] │
│ ✓ 2. Logística     Confirmada · Ana R. · 03/06        [Deshacer] │
│ ● 3. Producción    Lista — etapas 5/5         [ ✓ Confirmar ]    │
│ ○ 4. Pruebas       Esperando Producción                          │
│ ○ 5. Completado    Esperando Pruebas                             │
└───────────────────────────────────────────────────────────────────┘
```

Estados de fila:
- **Firmada** → ✓ verde, "quién · cuándo", botón **Deshacer** (si tiene permiso del área).
- **Lista para firmar** → botón **✓ Confirmar** activo (si tiene permiso) + detalle ("Materiales 7/7").
- **Faltan datos** → botón deshabilitado + qué falta ("Faltan 3 materiales por comprar").
- **Esperando** → texto "Esperando {etapa anterior}".

El panel calcula readiness en el cliente con las mismas funciones puras + los datos vivos del
proyecto. Tras confirmar/deshacer → refetch del proyecto (`onUpdate`) → stepper y panel se
actualizan juntos. Quien no tiene permiso ve el botón en gris (informativo, no accionable).

### Cambio en `TabProduccion.tsx`

Se quitan los checkboxes "Pruebas completadas" y "Listo para envío" y su botón Guardar — esas dos
etapas ahora se firman en el panel. Las etapas de producción siguen editándose inline en la pestaña.

## Componentes afectados

| Archivo | Cambio |
|---------|--------|
| `supabase/migrations/005_confirmaciones_flujo.sql` | **Nuevo** — tabla + RLS |
| `scripts/backfill-confirmaciones.mjs` | **Nuevo** — backfill de proyectos existentes |
| `lib/utils/estado-proyecto.ts` | `computeReadiness`, `computeEstadoFromConfirmaciones`, `cascadeEtapas`; tipo `Etapa` del flujo |
| `types/index.ts` | `Confirmacion` + `Proyecto.confirmaciones` |
| `app/api/proyectos/[id]/route.ts` | acciones `confirmarEtapa`/`deshacerEtapa`; estado desde confirmaciones; GET incluye confirmaciones |
| `app/api/proyectos/route.ts` | lista: embeber confirmaciones + estado desde firmas |
| `components/proyectos/FlujoVerificacion.tsx` | **Nuevo** — panel verificador |
| `app/(dashboard)/proyectos/[id]/page.tsx` | render del panel bajo el stepper |
| `components/proyectos/tabs/TabProduccion.tsx` | quitar checkboxes pruebas/envío + botón Guardar |
| `components/proyectos/EstadoStepper.tsx` | usa confirmaciones para iluminarse (en vez de datos) |

## Pruebas

### Unit — `scripts/test-flujo-confirmaciones.ts`
- Readiness respeta orden (Logística no lista sin Ingeniería firmada aunque materiales `COMPLETO`).
- Readiness exige datos (Ingeniería firmada + materiales a medias → Logística "faltan datos").
- Pruebas/Completado listos en cuanto la etapa previa está firmada.
- Estado: cada subconjunto de firmas → estado correcto.
- Cascada: deshacer Logística deja solo `{ingenieria}`.

### E2E — `scripts/e2e-confirmaciones.mjs` (BD + API real, reusa `scripts/lib/supabase-test.mjs`)
1. Confirmar Logística antes que Ingeniería → `409`.
2. Plano "Aprobados y firmados" → confirmar Ingeniería → `COMPRAS EN CURSO`.
3. Materiales `COMPLETO` → confirmar Logística → `EN PRODUCCIÓN`.
4. Etapas `COMPLETADO` → confirmar Producción → `LISTO PARA PRUEBAS`.
5. Confirmar Pruebas y Completado → `COMPLETADO`.
6. Deshacer Logística (cascada) → solo Ingeniería firmada → `COMPRAS EN CURSO`.
7. Permisos: rol Logística NO puede confirmar Producción → `403`.
8. Limpieza.

### Regresión
- `scripts/test-flujo-estado.mjs` (basado en datos) se **reemplaza** por el nuevo (el estado ya no
  deriva de datos).
- `scripts/e2e-sweep.mjs` (8 páginas) se vuelve a correr para confirmar render limpio del detalle.
- Verificar el backfill contra un proyecto sembrado.

## Fuera de alcance (YAGNI)

- Historial/auditoría más allá de la última firma por etapa (no se guardan versiones).
- Notificaciones al avanzar de etapa.
- Confirmación parcial o por sub-tareas dentro de una etapa.
- Permiso de firma para Gerencia (se deja como solo-lectura; se puede agregar luego).
