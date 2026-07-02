# Dockerización BBTI ERP — Enfoque A (monolito Next.js)

**Fecha:** 2026-07-02
**Estado:** Aprobado por el usuario. Pendiente respuesta del ingeniero sobre NestJS (ver "Decisión pendiente").
**Origen:** Observaciones del ingeniero de infraestructura (WhatsApp, 2026-07-02).

## Contexto

El ingeniero que desplegará el sistema en su servidor pidió 4 cambios:

1. **Base de datos:** él provee un Postgres compartido con acceso a un schema dedicado (connection string estilo `?schema=gestion_proyectos`).
2. **Docker:** proyecto completamente dockerizado con labels de Traefik en el compose. (Su mensaje asume backend NestJS + frontend Next.js.)
3. **Archivos:** almacenamiento en Cloudflare R2 (API compatible S3).
4. **GitHub:** repo con URL pública para clonar y desplegar.

Estado actual: monolito Next.js 16 (App Router, backend en API routes) + Supabase (DB + Auth + Storage + Realtime), desplegado en Vercel con Vercel Cron. ~32 archivos tocan Supabase (~15 rutas API, hooks, helpers).

**Implicación clave:** salir de la BD de Supabase arrastra Auth, Realtime y Storage — hay que reemplazar los cuatro pilares, no solo mover tablas.

## Decisiones ya tomadas

- **Datos:** el sistema está en demo → se empieza limpio en el nuevo Postgres (migraciones + seed, sin migración de datos).
- **Repo:** se hace **público** el repo actual `mirkovedia/bbti-erp` (re-verificar historial limpio de credenciales antes de publicar).
- **Enfoque:** A (monolito Next.js dockerizado). Si el ingeniero exige NestJS, se re-especifica la arquitectura (ver "Decisión pendiente").

## Decisión pendiente (bloqueante para implementar)

**¿NestJS es requisito de la plataforma del ingeniero?**
- Si acepta Next.js full-stack en contenedor → este spec aplica tal cual (~1–1.5 semanas).
- Si exige NestJS → se agrega el port de ~15 endpoints a un backend separado (monorepo `apps/api` NestJS + `apps/web` Next.js, 2 servicios en el compose). El resto de este spec (Prisma, JWT, R2, cron, repo) se reutiliza casi íntegro (~3–4 semanas total).

## No-objetivos

- Migrar datos existentes de Supabase (es demo).
- WebSockets/SSE para notificaciones (polling basta; queda como mejora futura).
- Cambios de lógica de negocio, UI o permisos. Las funciones puras (`estado-proyecto.ts`, `vencimiento.ts`, etc.) y la matriz de permisos no se tocan.
- Mantener el deploy de Vercel después del corte (se descontinúa).

---

## Diseño

### 1. Arquitectura general

Un contenedor `web` (Next.js full-stack) + un sidecar `cron`. La BD es externa (Postgres del ingeniero), **no va en el compose de producción**.

- **Imagen:** multi-stage sobre `node:22-alpine` (deps → build → runner), `output: 'standalone'` en `next.config.ts`, usuario non-root, `openssl` instalado (lo requiere Prisma en musl).
- **Compose de producción** (`docker-compose.yml`):

```yaml
services:
  web:
    build: .
    env_file: .env
    restart: unless-stopped
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.bbti.rule=Host(`${APP_DOMAIN}`)"
      - "traefik.http.routers.bbti.entrypoints=websecure"
      - "traefik.http.routers.bbti.tls.certresolver=${CERT_RESOLVER}"
      - "traefik.http.services.bbti.loadbalancer.server.port=3000"
    networks: [traefik, internal]
  cron:
    # dispara GET /api/cron/alertas-vencimiento 1x/día (08:00 Lima) con CRON_SECRET
    build: ./docker/cron   # alpine + crond + curl
    env_file: .env
    restart: unless-stopped
    networks: [internal]   # solo necesita alcanzar a web, no expone nada en Traefik
networks:
  traefik:
    external: true
  internal: {}
```

Dominio, certresolver y nombre de red quedan parametrizados (`${APP_DOMAIN}`, `${CERT_RESOLVER}`) — son datos del ingeniero.

- **Compose de desarrollo** (`docker-compose.dev.yml`): añade un Postgres 16 local para desarrollar sin depender del servidor del ingeniero.

### 2. Base de datos: Supabase → Prisma + Postgres externo

- `DATABASE_URL=postgresql://user:pass@host:5432/db?schema=gestion_proyectos` (el `?schema=` es la convención de Prisma; encaja con lo que el ingeniero describió).
- Las migraciones SQL `001–015` de Supabase se consolidan en **un `schema.prisma` inicial** con todas las tablas: `users`, `proyectos`, `proyecto_comercial`, `proyecto_materiales`, `proyecto_etapas`, `proyecto_pagos`, `proyecto_comentarios`, `proyecto_observaciones`, `proyecto_confirmaciones`, `proyecto_documentos`, `documento_eventos`, `notificaciones`, `actividad_log`, `alertas`, `proyecto_alertas_enviadas`, `company_config`, `role_permissions`.
- **RLS desaparece** (era mecanismo de Supabase). La seguridad no se degrada: toda autorización ya se revalida server-side en las rutas API con la matriz de permisos (`PERMS` + `role_permissions` dinámica). Esa capa queda intacta.
- Todas las queries `supabase.from(...)` se reescriben a Prisma Client. Los quirks de PostgREST (embed objeto-vs-array, `maybeSingle`) desaparecen — las relaciones Prisma son tipadas.
- El backend usaba service role para bypasear RLS (bitácoras, notificaciones); con Prisma ya no aplica la distinción — un solo cliente Prisma server-side.
- `prisma migrate deploy` + `prisma db seed` como paso de despliegue (ver §7).

### 3. Autenticación: Supabase Auth → JWT propio

- `users` gana columna `password_hash` (**bcryptjs** — sin binarios nativos que rompan el build en Alpine).
- `POST /api/auth/login`: valida credenciales → firma JWT con **jose** (HS256, `JWT_SECRET`, exp 7d, payload: sub/rol/nombre) → cookie **httpOnly + secure + sameSite=lax**.
- `POST /api/auth/logout`: limpia cookie (y el store Zustand como hoy).
- `proxy.ts`: reemplaza `supabase.auth.getUser()` por `jwtVerify()` de jose (compatible con runtime edge). El resto del guard queda igual, incluido el bypass de `/api/cron`.
- Helper server `getSession()` reemplaza la lectura de sesión Supabase en las ~15 rutas API.
- Seed: mismos 7 usuarios demo (admin@bbti.com.pe etc.) con hash bcryptjs.
- La página de Usuarios (crear/editar) pasa a escribir `password_hash` en vez de llamar al Admin API de Supabase.

### 4. Notificaciones: Realtime → polling

- `hooks/useNotificaciones.ts` deja la suscripción `postgres_changes` y pasa a **polling cada ~20s** contra `GET /api/notificaciones` (patrón ya existente: el dashboard tiene polling de 10s).
- Chime + destello se disparan al detectar IDs nuevos en el diff entre polls.
- El feed de actividad del command center pierde su canal Realtime y conserva su polling.
- Mejora futura (fuera de alcance): SSE o WebSocket.

### 5. Documentos: Supabase Storage → Cloudflare R2

- SDK: `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`, endpoint `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com`, `region: 'auto'`, bucket privado (p.ej. `bbti-documentos`).
- Mapeo 1:1 del flujo actual:
  - `POST /api/documentos/upload-url` → presigned **PUT** (antes `createSignedUploadUrl`).
  - `POST /api/documentos/download-url` → presigned **GET** con expiración corta (antes `createSignedUrl`).
  - `DELETE /api/documentos/[id]` → `DeleteObjectCommand` + borrado de metadatos.
- Se conservan: estructura de paths `${proyecto_id}/archivo`, validación server de que el path empiece con el proyecto, límite 25MB, permisos (subir/descargar autenticado, eliminar Admin), bitácora `documento_eventos`.
- ⚠️ **CORS del bucket:** R2 debe permitir PUT/GET desde el dominio de la app, si no el upload desde navegador falla. Responsable: definir con el ingeniero (pregunta 5).

### 6. Cron de alertas de vencimiento

- El endpoint `GET /api/cron/alertas-vencimiento` (auth por `CRON_SECRET`, lógica de dedup edge-triggered) **no se modifica**.
- Cambia el disparador: de Vercel Cron al sidecar `cron` del compose (crond en Alpine ejecuta `curl -H "Authorization: Bearer $CRON_SECRET" http://web:3000/api/cron/alertas-vencimiento` a las 13:00 UTC = 08:00 Lima).
- Alternativa si el ingeniero prefiere un solo contenedor: `node-cron` dentro del web vía instrumentation; se decide con su respuesta a la pregunta 6.

### 7. Repo público y entrega

- `mirkovedia/bbti-erp` → **público**. Antes de publicar: re-auditar historial (`git log -p -- .env*`, scan de secretos) — quedó limpio en el deploy de junio, se re-verifica.
- **README de despliegue** (la ruta del ingeniero):
  1. `git clone https://github.com/mirkovedia/bbti-erp`
  2. `cp .env.example .env` y completar valores
  3. `docker compose up -d --build`
  4. Migraciones + seed: `docker compose exec web npx prisma migrate deploy && docker compose exec web npm run seed` (o script `deploy.sh` que encadena todo)
- `.env.example` actualizado con el set nuevo de variables (ver §8). Las variables `NEXT_PUBLIC_SUPABASE_*` y `SUPABASE_SERVICE_ROLE_KEY` desaparecen.
- Vercel: se descontinúa en el corte (sin Supabase la app no funcionaría ahí de todos modos). El `vercel.json` (cron) se elimina.

### 8. Variables de entorno

| Variable | Uso |
|---|---|
| `DATABASE_URL` | Postgres del ingeniero con `?schema=gestion_proyectos` |
| `JWT_SECRET` | Firma de sesiones (min 32 chars) |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` | Cloudflare R2 |
| `CRON_SECRET` | Auth del endpoint de cron |
| `APP_DOMAIN` / `CERT_RESOLVER` | Labels de Traefik en el compose |

### 9. Testing y verificación

- **Unit (71):** funciones puras — sobreviven sin cambios (no dependen de Supabase).
- **E2E (6 suites Playwright):** se adaptan — `scripts/lib/supabase-test.mjs` se reemplaza por helper Prisma/pg (`getAuthCookie` pasa a loguearse contra `/api/auth/login`). Misma cobertura: firmas de etapas, regla pago 100%, permisos dinámicos, papelera, notificaciones, cron.
- **Corren contra el stack dockerizado local** (`docker-compose.dev.yml`).
- **Prueba de entrega:** clonar el repo público en una carpeta limpia y desplegar desde cero siguiendo solo el README (simula la experiencia del ingeniero).

### 10. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Next 16 difiere del conocimiento previo (proxy.ts, deprecaciones) | Regla del repo (AGENTS.md): leer `node_modules/next/dist/docs/` antes de codear |
| JWT en runtime edge | `jose` (no `jsonwebtoken`, que no corre en edge) |
| bcrypt nativo rompe build Alpine | `bcryptjs` (JS puro) |
| Prisma en Alpine/musl | instalar `openssl` en la imagen; binary target `linux-musl-openssl-3.0.x` |
| CORS del bucket R2 | checklist explícito con el ingeniero antes del corte |
| Historial git con secretos al publicar | re-scan antes de cambiar visibilidad |
| Permisos del usuario de BD insuficientes para `migrate deploy` | pregunta 2/3 al ingeniero; fallback: entregarle el SQL generado (`prisma migrate diff`) |
