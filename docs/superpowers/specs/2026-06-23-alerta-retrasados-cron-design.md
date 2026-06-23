# Alerta automática de vencimiento (cron diario)

**Fecha:** 2026-06-23
**Estado:** Aprobado (pendiente de plan de implementación)

## Problema

Hoy el estado **RETRASADO** se calcula como overlay al leer (`aplicarRetraso`): solo
se ve si alguien entra a la app. No hay aviso proactivo. Un proyecto puede vencer sin
que nadie se entere hasta abrir el dashboard. Quedó documentado como "fase 2" porque
necesita una tarea programada (cron), no es una acción de usuario.

## Objetivo

Un job diario que detecte proyectos **retrasados** y **por vencer** y notifique
**proactivamente** al área responsable, una sola vez por cruce de estado.

## Decisiones de diseño (brainstorm 2026-06-23)

1. **Alcance:** avisa de **retrasados** (`fecha_entrega < hoy`) **y por vencer**
   (dentro de `dias_alerta` días configurables, default 7).
2. **Frecuencia:** **edge-triggered** — avisa una sola vez el día que el proyecto
   *cruza* a cada estado. `por_vencer` y `retrasado` son cruces distintos, así que un
   proyecto que empeora de "por vencer" a "retrasado" recibe un segundo aviso (escala).
3. **Destinatario:** solo el **área responsable actual** — el rol de la primera etapa
   sin firmar, derivado con `rolDelAreaDeEtapa`. Sin copia a Comercial/Gerencia/Finanzas.
4. **Mecanismo:** **Vercel Cron** (1×/día), endpoint protegido con `CRON_SECRET`.
   Cero infraestructura nueva; encaja con el deploy actual en Vercel.
5. **Exclusiones:** proyectos `COMPLETADO` y los de la papelera (`activo=false`).

## Arquitectura

```
Vercel Cron (1×/día, 08:00 Lima = 13:00 UTC)
  → GET /api/cron/alertas-vencimiento        [valida Authorization: Bearer <CRON_SECRET>]
      → admin client (service role, bypassa RLS)
      → lib/utils/vencimiento.ts (funciones puras, testeables)
      → notificar() (helper existente → fan-out al rol del área)
      → tabla proyecto_alertas_enviadas (deduplicación)
```

## Modelo de datos — migración `014_alertas_vencimiento.sql`

Tabla de deduplicación (memoria de "ya avisé") para garantizar el comportamiento
edge-triggered:

```sql
create table proyecto_alertas_enviadas (
  id          bigint generated always as identity primary key,
  proyecto_id text not null references proyectos(id) on delete cascade,
  tipo        text not null check (tipo in ('por_vencer','retrasado')),
  enviada_at  timestamptz not null default now(),
  unique (proyecto_id, tipo)
);
alter table proyecto_alertas_enviadas enable row level security;
-- sin políticas públicas: solo el backend con service role escribe/lee.
```

El `unique (proyecto_id, tipo)` es la barrera anti-duplicado: si la fila ya existe,
no se vuelve a notificar ese tipo.

## Lógica del endpoint — `app/api/cron/alertas-vencimiento/route.ts`

1. Valida `Authorization: Bearer <CRON_SECRET>`. Si no coincide → `401`.
2. Lee `dias_alerta` de `company_config` (fallback 7) y todos los proyectos
   `activo !== false` con sus `proyecto_confirmaciones`.
3. Calcula `hoy` como fecha de **America/Lima** (UTC-5, sin DST).
4. Por cada proyecto:
   - Deriva el estado real con `computeEstadoFromConfirmaciones`.
   - `tipo = clasificarVencimiento(fecha_entrega, hoy, diasAlerta, estado)`
     → `'retrasado' | 'por_vencer' | null`.
   - Si `tipo` no es null y **no existe** fila dedup `(proyecto_id, tipo)`:
     - Determina el área responsable: `rolDelAreaDeEtapa(primeraEtapaSinConfirmar)`.
     - `notificar({ proyectoId, tipo:'vencimiento', mensaje, rolesDestino:[rolArea], actorNombre:'Sistema' })`
       (sin `actorId` → no excluye a nadie; el aviso lo emite el sistema).
     - Inserta la fila dedup.
5. **Housekeeping:** borra filas dedup cuyo `tipo` ya no aplica al estado actual del
   proyecto (reprogramado a futuro, o completado). Así, si el proyecto vuelve a cruzar
   más adelante, se re-alerta correctamente.
6. Devuelve `{ revisados, avisados, detalle }` en JSON (para logs y disparo manual).

## Funciones puras — `lib/utils/vencimiento.ts`

- `clasificarVencimiento(fechaEntrega: string|null, hoy: string, diasAlerta: number, estado: EstadoProyecto): 'retrasado' | 'por_vencer' | null`
  - `COMPLETADO` o sin `fechaEntrega` → `null`.
  - `fechaEntrega < hoy` → `'retrasado'`.
  - `hoy <= fechaEntrega <= hoy + diasAlerta` → `'por_vencer'`.
  - resto → `null`.
- `mensajeVencimiento(tipo, proyectoId, cliente, dias, etapaLabel): string`
  - por_vencer: `"<id> (<cliente>) vence en <dias> día(s). Está en <etapa>."`
  - retrasado: `"<id> (<cliente>) está retrasado <dias> día(s). Está en <etapa>."`
- Reutiliza de `lib/utils/estado-proyecto.ts`: `computeEstadoFromConfirmaciones` y la
  derivación de la primera etapa sin confirmar; de `lib/notificaciones.ts`:
  `rolDelAreaDeEtapa`.

## Fechas

Perú = UTC-5 sin horario de verano. `hoy` se calcula en zona America/Lima para evitar
desfase de un día respecto al UTC del runtime de Vercel. Cron en UTC: `"0 13 * * *"`.

## Configuración

- `CRON_SECRET` en `.env.local` y en Vercel (los 3 entornos). Vercel inyecta
  automáticamente `Authorization: Bearer <CRON_SECRET>` en las llamadas de cron.
- `vercel.json`:
  ```json
  { "crons": [ { "path": "/api/cron/alertas-vencimiento", "schedule": "0 13 * * *" } ] }
  ```

## Errores y robustez

- Endpoint en try/catch global → nunca tumba el cron. Un proyecto que falle se loguea y
  se sigue con el resto (no frena el lote).
- `notificar()` ya es no-lanzante (try/catch interno) — un fallo de aviso no rompe la
  inserción dedup ni el barrido.

## Testing

- **Unit** (`scripts/test-vencimiento.ts`, tsx): `clasificarVencimiento` en bordes
  (vencido, justo en el umbral `hoy+diasAlerta`, fuera del umbral, `COMPLETADO`→null,
  sin fecha→null) y `mensajeVencimiento`.
- **Integración** (`scripts/e2e-alertas-vencimiento.mjs`): crea proyecto con
  `fecha_entrega` pasada → llama al endpoint con el secreto → verifica notificación al
  área responsable + fila dedup; segunda llamada → **sin duplicado**; mueve la fecha a
  futuro → housekeeping limpia la fila. Limpieza al final (borra proyecto + notis).

## Archivos

| Archivo | Acción |
|---------|--------|
| `migrations/014_alertas_vencimiento.sql` | nuevo (tabla dedup) |
| `lib/utils/vencimiento.ts` | nuevo (funciones puras) |
| `app/api/cron/alertas-vencimiento/route.ts` | nuevo (endpoint) |
| `vercel.json` | nuevo (bloque crons) |
| `.env.local` + Vercel env | añadir `CRON_SECRET` |
| `scripts/test-vencimiento.ts` | nuevo (unit) |
| `scripts/e2e-alertas-vencimiento.mjs` | nuevo (integración) |

## Fuera de alcance (YAGNI)

- Notificación por email/WhatsApp (otra feature aparte).
- Copia a Comercial/Gerencia/Finanzas (se decidió solo área responsable).
- Recordatorio diario recurrente (se decidió edge-triggered, una vez por cruce).
- Configuración de horario del cron desde la UI.
