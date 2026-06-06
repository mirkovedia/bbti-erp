# Diseño: Notificaciones por eventos en tiempo real (campanita)

**Fecha:** 2026-06-06
**Proyecto:** BBTI ERP
**Estado:** Aprobado por el usuario (pendiente revisión del spec)

## Problema

El sistema es para toda la empresa (Comercial, Ingeniería, Logística, Producción, Finanzas),
pero **hoy nadie se entera cuando otro hace algo**: si Ingeniería sube un plano o Logística
confirma sus compras, el área que sigue no recibe ningún aviso. La página "Alertas" solo
*calcula* vencimientos por fecha (no es un registro de eventos), y la tabla `alertas` está sin uso.
No hay tiempo real, ni correo, ni notificaciones de ningún tipo.

## Decisión

Construir un **sistema de notificaciones por eventos** con **campanita en tiempo real dentro de la
app** (Supabase Realtime — ya incluido, sin servicios externos ni costo). Email/WhatsApp quedan
fuera de alcance por ahora (se pueden sumar después como canal extra sobre la misma tabla).

Routing **por flujo (handoff)**: cada evento avisa al **rol del área que debe actuar**, repartido a
sus usuarios activos, **excluyendo a quien hizo la acción**.

Eventos cubiertos (los 4 grupos elegidos): documentos, confirmaciones de etapa, datos cargados,
hitos del proyecto.

## Modelo de datos

### Decisión: fan-out por usuario
Al ocurrir un evento se crea **una fila por cada usuario destinatario** (no una por rol), para que
cada quien tenga su propio estado leída/no leída.

### Migración `006_notificaciones.sql`
```sql
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
-- No se crean políticas de escritura: TODO lo escribe el backend con service role, que
-- bypasea RLS. Así ningún usuario puede leer/escribir notificaciones ajenas.
-- (OJO: una política `for all` rompería el aislamiento porque las políticas se combinan con OR
--  e incluiría el SELECT — por eso solo va la de SELECT propia.)
create policy "read_own_notificaciones" on notificaciones
  for select using (destinatario_id = auth.uid());

-- Habilitar tiempo real en la tabla
alter publication supabase_realtime add table notificaciones;
```

La tabla `alertas` existente **no se modifica**: sigue siendo la vista de vencimientos por fecha.
`notificaciones` es el registro nuevo de eventos que alimenta la campanita.

## Enrutamiento (evento → roles destino)

| Evento | Disparador | Roles destino |
|--------|-----------|---------------|
| Nuevo proyecto creado | `POST /api/proyectos` | Ingeniería |
| Metrado importado (actor = Comercial) | `PATCH …/[id]` con `materiales` | Logística |
| Comprobante de adelanto subido | `POST /api/documentos` (nombre con prefijo "Comprobante adelanto:") | Finanzas |
| Otro documento/plano subido | `POST /api/documentos` | Comercial |
| Plano "Enviados a comercial" | `PATCH …/[id]` `updateDocumento` (estado match /enviad/i) | Comercial |
| Confirmó Ingeniería | `PATCH …/[id]` `confirmarEtapa: ingenieria` | Logística |
| Confirmó Logística | `confirmarEtapa: logistica` | Producción |
| Confirmó Producción / Pruebas | `confirmarEtapa: produccion` / `pruebas` | Comercial + Gerencia General |
| Confirmó Completado | `confirmarEtapa: completado` | Comercial + Finanzas + Gerencia General |
| Deshizo una etapa | `deshacerEtapa: X` | rol del área de X |

**Mapa etapa → rol del área** (para confirmar y deshacer):
`ingenieria→Ingeniería`, `logistica→Logística`, `produccion/pruebas/completado→Producción`.
En deshacer se notifica al rol del área de la etapa deshecha.

**Distinción metrado vs edición de materiales:** se usa el **rol del actor** — si quien hace el
PATCH de `materiales` es Comercial, es el import de metrado → avisa a Logística; si es Logística,
es trabajo interno → sin aviso. No requiere banderas ni cambios en el frontend.

**Fuera de alcance (fase 2):** "Proyecto retrasado" no es una acción de un usuario (ocurre al vencer
la fecha); avisarlo requiere un trabajo programado (cron diario) que revise vencimientos. Se difiere.

## Generación de eventos

### Helper `lib/notificaciones.ts` (servidor)
```ts
import { createAdminClient } from '@/lib/supabase/admin';
import type { Rol } from '@/types';

export interface NotificarInput {
  proyectoId: string;
  tipo: 'documento' | 'confirmacion' | 'datos' | 'hito';
  mensaje: string;
  rolesDestino: Rol[];
  actorId?: string;       // se excluye del fan-out
  actorNombre?: string;
}

// notificar(input): busca usuarios activos de rolesDestino (sin el actor) e inserta
// una fila por usuario con el service role. try/catch interno → nunca lanza (un fallo
// al notificar no debe romper la acción principal). Devuelve void.
```

### Funciones puras de enrutamiento (testeables, en `lib/notificaciones.ts`)
- `rolesParaConfirmacion(etapa: EtapaFlujo): Rol[]`
- `mensajeConfirmacion(etapa: EtapaFlujo, proyectoId: string): string`
- `rolDelAreaDeEtapa(etapa: EtapaFlujo): Rol`

### Puntos de integración (cada uno gana 1-2 líneas `await notificar(...)`)
- `POST /api/proyectos` — tras crear: hito → Ingeniería.
- `PATCH /api/proyectos/[id]`:
  - `confirmarEtapa` — tras el upsert: confirmacion → `rolesParaConfirmacion(etapa)` con `mensajeConfirmacion`.
  - `deshacerEtapa` — tras el delete: confirmacion → `rolDelAreaDeEtapa(etapa)`, mensaje "Se revirtió la etapa …".
  - `materiales` — si `rol` del actor es Comercial: datos → Logística ("Comercial importó el metrado de …").
  - `updateDocumento` — si `estado` match /enviad/i: documento → Comercial ("Ingeniería envió un plano de … para revisión").
- `POST /api/documentos` — tras registrar metadatos:
  - nombre empieza con "Comprobante adelanto:" → documento → Finanzas.
  - en otro caso → documento → Comercial ("… subió el documento … a …").

El `actorId`/`actorNombre` se toman del usuario autenticado (ya se cargan `nombre`/`rol` en esos
endpoints).

## Tiempo real y API

- **`GET /api/notificaciones`** → notificaciones del usuario actual: últimas 20 + `unreadCount`.
- **`POST /api/notificaciones/marcar-leidas`** → body `{ ids?: string[] }`; sin `ids` marca todas las
  del usuario. Marca `leida = true` (service role, acotado al `destinatario_id` del usuario).
- **Hook `useNotificaciones()`** (cliente):
  1. Al montar: `GET` inicial (lista + no leídas).
  2. Suscripción con el cliente Supabase del navegador a `postgres_changes` (evento INSERT) en
     `notificaciones`, filtro `destinatario_id=eq.<miId>`. Al llegar una fila: la antepone y sube el
     badge.
  3. Expone `list`, `unreadCount`, `markAllRead()`, `markRead(id)`.

`miId` = `user.id` del store (`users.id` = `auth.users.id`). La RLS (`destinatario_id = auth.uid()`)
es la misma regla que filtra el Realtime.

## UI

### `components/layout/NotificacionesBell.tsx`
Reemplaza la campanita estática del `Topbar`. Usa `useNotificaciones()`.
- Badge con el número de no leídas (sin badge si es 0).
- Click → panel desplegable (arriba a la derecha):
  - Ítem: ícono por tipo (📄 documento / ✅ confirmacion / 📦 datos / 🚩 hito), mensaje, actor,
    proyecto, tiempo relativo. No leídas con fondo resaltado + punto.
  - Click en ítem → `router.push('/proyectos/{proyecto_id}')` + marcar leído.
  - Cabecera "Notificaciones" + botón "Marcar todas como leídas".
  - Estado vacío: "Sin notificaciones".
- Nuevas notificaciones por Realtime suben el badge y aparecen al instante.

Helper `tiempoRelativo(iso): string` ("hace 5 min", "hace 2 h", "ayer") en `lib/utils/format.ts`.

### `components/layout/Topbar.tsx`
Sustituir el `<button>` de la campanita estática por `<NotificacionesBell />`.

## Componentes afectados

| Archivo | Cambio |
|---------|--------|
| `supabase/migrations/006_notificaciones.sql` | **Nuevo** — tabla + RLS + publication realtime |
| `types/index.ts` | **Nuevo** tipo `Notificacion` |
| `lib/notificaciones.ts` | **Nuevo** — `notificar` + funciones puras de enrutamiento |
| `lib/utils/format.ts` | **Modificar** — `tiempoRelativo` |
| `app/api/notificaciones/route.ts` | **Nuevo** — `GET` lista + no leídas |
| `app/api/notificaciones/marcar-leidas/route.ts` | **Nuevo** — `POST` marcar leídas |
| `app/api/proyectos/route.ts` | **Modificar** — notificar en `POST` (nuevo proyecto) |
| `app/api/proyectos/[id]/route.ts` | **Modificar** — notificar en confirmar/deshacer/materiales/updateDocumento |
| `app/api/documentos/route.ts` | **Modificar** — notificar en `POST` (comprobante/plano) |
| `hooks/useNotificaciones.ts` | **Nuevo** — fetch inicial + suscripción Realtime |
| `components/layout/NotificacionesBell.tsx` | **Nuevo** — campanita + panel |
| `components/layout/Topbar.tsx` | **Modificar** — usar `NotificacionesBell` |

## Pruebas

### Unit — `scripts/test-notificaciones.ts`
- `rolesParaConfirmacion`: `ingenieria→[Logística]`, `logistica→[Producción]`,
  `produccion→[Comercial,Gerencia General]`, `completado→[Comercial,Finanzas,Gerencia General]`.
- `mensajeConfirmacion`: incluye el id del proyecto y describe la etapa.
- `rolDelAreaDeEtapa`: `logistica→Logística`, etc.

### E2E — `scripts/e2e-notificaciones.mjs` (BD + API real)
1. Admin crea proyecto → existe ≥1 notificación hito para un usuario de Ingeniería.
2. Aprobar plano + `confirmarEtapa: ingenieria` (como Admin) → un usuario de **Logística** recibe la
   notificación de confirmación (`GET /api/notificaciones` con cookie de Logística la lista).
3. El **actor no se auto-notifica** (si Logística confirmara, no se crea fila para ese mismo usuario).
4. `POST /api/notificaciones/marcar-leidas` marca leídas y `unreadCount` baja.
5. Limpieza (borrar proyecto → cascada borra sus notificaciones).

### Realtime
Verificación **manual** (dos sesiones: actuar en una, ver el badge subir en la otra). El headless no
prueba bien websockets; lo automático cubre que las filas se crean y los endpoints responden.

### Regresión
`scripts/e2e-sweep.mjs` — el Topbar con la campanita real renderiza sin errores en las 8 páginas.

## Fuera de alcance (YAGNI)

- Email y WhatsApp (se pueden sumar luego como canal sobre la misma tabla `notificaciones`).
- Notificación de "proyecto retrasado" por vencimiento (requiere cron; fase 2).
- Preferencias por usuario de qué seguir (se eligió routing por flujo, no configurable).
- Agrupación/colapso de notificaciones, paginación infinita (basta con las últimas 20 + "marcar todas").
- Toast emergente (basta con el badge y el panel en vivo).
