# Migración BBTI ERP — Docker + PostgreSQL (RDS) + Cloudflare R2

**Fecha:** 2026-07-02
**Estado:** Aprobado por el usuario. Listo para plan de implementación.
**Origen:** Paquete del consultor externo (`bbti-erp-cambios-especificos/` y `bbti-erp-consultor-docker-rds-r2/`, no trackeados en git) fusionado con el spec previo de Enfoque A.
**Reemplaza a:** `2026-07-02-dockerizacion-enfoque-a-design.md` (superseded).

## Contexto

El ingeniero de infraestructura entregó un paquete de migración con requisitos explícitos. Este spec los cumple todos y cierra los huecos que el propio paquete deja abiertos (auth, cron, migración de esquema).

**Requisitos del ingeniero → dónde los resuelve este spec:**

| # | Requisito del ingeniero | Sección |
|---|---|---|
| 1 | Dockerizar el proyecto | §1, §2 |
| 2 | Puerto externo `3006` | §3 |
| 3 | Reemplazar Supabase por PostgreSQL (AWS RDS) | §4 |
| 4 | Schema específico dentro de RDS | §4 |
| 5 | Cloudflare R2 compatible S3 | §6 |
| 6 | Variables de entorno claras y seguras | §8 |
| 7 | Listo para desplegar en Linux con Docker Compose | §10 |

**Instrucción adicional del ingeniero (WhatsApp, 2026-07-02):** instalar Postgres local con accesos propios y preparar los scripts de migración de BD; los accesos reales de RDS llegan después. → §4 define el flujo local-primero y el corte a RDS.

**Estado actual:** monolito Next.js 16 (App Router, backend en API routes) + Supabase (DB + Auth + Storage + Realtime), desplegado en Vercel con Vercel Cron. **48 archivos** tocan Supabase (252 ocurrencias): ~15 rutas API, hooks, helpers, scripts E2E. 15 migraciones SQL en `supabase/migrations/`.

## Decisiones

| Decisión | Elección | Razón |
|---|---|---|
| Capa DB | **Prisma** (no `pg` crudo) | El `?schema=` del `DATABASE_URL` del paquete es convención de Prisma; con `pg` se ignora silenciosamente. Queries tipadas para reescribir 48 archivos con menos riesgo. El paquete genérico del consultor lista Prisma como opción válida. |
| Exposición | **Puerto plano `3006:3000`**, sin labels Traefik | Pedido explícito del paquete. Compatible con cualquier reverse proxy del ingeniero. |
| Auth | **JWT propio** (bcryptjs + jose + cookie httpOnly) | Opción 3 del consultor. Salir de la BD de Supabase rompe Supabase Auth de todos modos; 7 usuarios internos no justifican NextAuth. |
| Cron | **Sidecar** en el compose (alpine + crond + curl) | El paquete no cubre el reemplazo de Vercel Cron. Cero cambios en la app; vive y muere con `docker compose up/down`. |
| Nombres BD/schema | Parametrizados; default `gestion_proyectos` | El ingeniero confirma valores reales en su `.env.production`. No bloquea implementación. |
| Datos existentes | **No se migran** (sistema en demo) | Se empieza limpio: schema + seed. Los "scripts de migración" = migraciones Prisma + seed reproducibles. |
| Realtime | **Polling ~20s** | Sin Supabase no hay Realtime. Patrón ya existente en el dashboard (10s). |

## No-objetivos

- Migrar datos existentes de Supabase (es demo; se empieza limpio con seed).
- WebSockets/SSE para notificaciones (mejora futura).
- Cambios de lógica de negocio, UI o permisos. Funciones puras (`estado-proyecto.ts`, `vencimiento.ts`, etc.) y matriz de permisos intactas.
- Mantener el deploy de Vercel después del corte (se descontinúa; `vercel.json` se elimina).
- Labels de Traefik en el compose (si el ingeniero los pide después, se agregan sin tocar nada más).

---

## Diseño

### 1. Arquitectura general

Dos contenedores en producción; la BD es externa (RDS del ingeniero) y **no va en el compose de producción**.

```text
┌─────────────────────────── docker compose ───────────────────────────┐
│                                                                       │
│  ┌──────────────────┐  red interna   ┌───────────────────────────┐    │
│  │ cron (sidecar)   │ ─────────────► │ bbti-erp (Next.js 16)     │    │
│  │ alpine+crond+curl│  curl 1x/día   │ standalone, non-root      │    │
│  └──────────────────┘                │ interno :3000             │    │
│                                      └─────────┬─────────────────┘    │
└────────────────────────────────────────────────┼──────────────────────┘
                                     host :3006 ◄┘
                                                 │
                    ┌────────────────────────────┼────────────────┐
                    ▼                            ▼                 ▼
          AWS RDS PostgreSQL          Cloudflare R2         (navegador)
          schema gestion_proyectos    bucket privado        http://HOST:3006
```

Archivos nuevos en la raíz del repo:

```text
Dockerfile
docker-compose.yml          # producción
docker-compose.dev.yml      # desarrollo: agrega Postgres 16 local
.dockerignore
.env.production.example
docker/cron/Dockerfile      # sidecar
docker/cron/crontab
prisma/schema.prisma
prisma/seed.ts
lib/db.ts                   # cliente Prisma singleton
lib/r2/r2Client.ts          # capa R2 (base: paquete del consultor)
lib/r2/r2Storage.ts
lib/auth/session.ts         # getSession(), firma/verificación JWT
app/api/health/route.ts     # healthcheck
app/api/auth/login/route.ts # reemplaza login Supabase
app/api/auth/logout/route.ts
```

### 2. Dockerfile

Mismo esqueleto multi-stage del consultor (`deps → builder → runner` sobre `node:22-alpine`) con hardening:

```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
RUN apk add --no-cache openssl curl \
 && addgroup -S nodejs && adduser -S nextjs -G nodejs
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
```

Diferencias deliberadas vs el Dockerfile del consultor:

- `npx prisma generate` antes de `next build` (el cliente Prisma se genera en build).
- `openssl` en runner (requisito de Prisma en musl; binary target `linux-musl-openssl-3.0.x`).
- `curl` en runner (lo usa el healthcheck).
- Usuario non-root `nextjs:nodejs`.
- `HOSTNAME=0.0.0.0` (Next standalone escucha en localhost por defecto dentro del contenedor).

`next.config.ts` gana `output: "standalone"` (verificar contra `node_modules/next/dist/docs/` — regla del repo para Next 16).

`.dockerignore`: lo del consultor + `docs/`, `supabase/`, `scripts/`, `*.md`, `bbti-erp-cambios-especificos/`, `bbti-erp-consultor-docker-rds-r2/`, `.playwright/`, `e2e-results/`.

### 3. Docker Compose y puerto 3006

`docker-compose.yml` (producción):

```yaml
services:
  bbti-erp:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: bbti-erp
    restart: unless-stopped
    ports:
      - "3006:3000"
    env_file:
      - .env.production
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 20s

  cron:
    build: ./docker/cron
    container_name: bbti-erp-cron
    restart: unless-stopped
    env_file:
      - .env.production
    depends_on:
      bbti-erp:
        condition: service_healthy
```

`docker-compose.dev.yml` (desarrollo — cumple la instrucción del ingeniero de trabajar contra Postgres local):

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: bbti
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./docker/db/init-schema.sql:/docker-entrypoint-initdb.d/init-schema.sql
volumes:
  pgdata: {}
```

`docker/db/init-schema.sql` crea `CREATE SCHEMA IF NOT EXISTS gestion_proyectos;` al primer arranque. `DATABASE_URL` local: `postgresql://postgres:postgres@localhost:5432/bbti?schema=gestion_proyectos`.

### 4. Base de datos: Supabase → Prisma + PostgreSQL (local primero, RDS al corte)

**Flujo según la instrucción del ingeniero:**

1. **Ahora (sin accesos RDS):** desarrollar y validar todo contra el Postgres 16 local del compose dev, con credenciales propias.
2. **Scripts de migración listos:** `prisma/schema.prisma` + migraciones Prisma versionadas + `prisma/seed.ts`. Reproducibles con dos comandos en cualquier Postgres.
3. **Corte (cuando lleguen los accesos):** cambiar `DATABASE_URL` al RDS y ejecutar los **mismos** scripts:

```bash
npx prisma migrate deploy   # crea schema y tablas en RDS
npm run seed                # usuarios demo + datos iniciales
```

Cero cambios de código entre local y RDS.

**Schema:** las 15 migraciones de `supabase/migrations/` (001–015) se consolidan en un `schema.prisma` inicial con las 17 tablas: `users`, `proyectos`, `proyecto_comercial`, `proyecto_materiales`, `proyecto_etapas`, `proyecto_pagos`, `proyecto_comentarios`, `proyecto_observaciones`, `proyecto_confirmaciones`, `proyecto_documentos`, `documento_eventos`, `notificaciones`, `actividad_log`, `alertas`, `proyecto_alertas_enviadas`, `company_config`, `role_permissions`. Se preservan índices de rendimiento (009) y soft-delete (010).

**Se elimina todo lo Supabase-specific de las migraciones:** `auth.uid()`, políticas RLS, roles `anon/authenticated`, `storage.objects`, publication de Realtime (014). La seguridad no se degrada: toda autorización ya se revalida server-side en las rutas API con la matriz de permisos (`PERMS` + `role_permissions` dinámica); esa capa queda intacta.

**Cliente:** `lib/db.ts` exporta un `PrismaClient` singleton (patrón global para dev con hot-reload). Las queries `supabase.from(...)` repartidas en los 48 archivos que tocan Supabase (~15 rutas API, helpers, hooks, scripts) se reescriben a Prisma Client. La distinción anon/service-role desaparece: un solo cliente server-side. Los quirks de PostgREST (embed objeto-vs-array, `maybeSingle`) desaparecen — las relaciones Prisma son tipadas.

**Conexión a RDS:** `?schema=gestion_proyectos` es soporte nativo de Prisma. TLS: `sslmode=require` en el URL de producción (RDS lo soporta por defecto); si el ingeniero exige verificación completa de CA, se agrega el bundle de RDS como paso documentado en el README.

### 5. Autenticación: Supabase Auth → JWT propio

- `users` gana columna `password_hash` (**bcryptjs** — JS puro, sin binarios nativos que rompan el build en Alpine).
- `POST /api/auth/login`: valida credenciales → firma JWT con **jose** (HS256, `JWT_SECRET`, exp 7d, payload: `sub`/`rol`/`nombre`) → cookie **httpOnly + secure + sameSite=lax**.
- `POST /api/auth/logout`: limpia cookie (y el store Zustand como hoy).
- `proxy.ts`: reemplaza `supabase.auth.getUser()` por `jwtVerify()` de jose (compatible con runtime edge). El resto del guard queda igual, incluido el bypass de `/api/cron`.
- Helper server `getSession()` en `lib/auth/session.ts` reemplaza la lectura de sesión Supabase en las ~15 rutas API.
- Seed: mismos 7 usuarios demo con hash bcryptjs.
- La página de Usuarios (crear/editar) pasa a escribir `password_hash` en vez de llamar al Admin API de Supabase.

### 6. Documentos: Supabase Storage → Cloudflare R2

Base: la capa del paquete del consultor (`r2Client.ts`, `r2Storage.ts`) con `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`, `region: 'auto'`, endpoint `R2_ENDPOINT_URL`, bucket privado.

**Extensión necesaria:** el paquete solo trae presigned GET; nuestro flujo sube desde el navegador con URL firmada, así que se agrega **presigned PUT** (`getR2UploadUrl`). Mapeo 1:1 del flujo actual:

| Endpoint | Antes (Supabase) | Después (R2) |
|---|---|---|
| `POST /api/documentos/upload-url` | `createSignedUploadUrl` | presigned **PUT** |
| `POST /api/documentos/download-url` | `createSignedUrl` | presigned **GET** (expiración corta) |
| `DELETE /api/documentos/[id]` | `storage.remove` | `DeleteObjectCommand` + borrado de metadatos |

Se conservan: estructura de paths `${proyecto_id}/archivo`, validación server de que el path empiece con el proyecto, límite 25MB, permisos (subir/descargar autenticado, eliminar Admin), bitácora `documento_eventos`.

⚠️ **CORS del bucket R2** (checklist con el ingeniero): debe permitir `PUT` y `GET` desde el dominio de la app, si no el upload desde navegador falla. Mientras no haya credenciales R2 reales, se valida contra un bucket R2 de prueba propio (free tier).

### 7. Cron de alertas de vencimiento

- El endpoint `GET /api/cron/alertas-vencimiento` (auth por `CRON_SECRET`, dedup edge-triggered) **no se modifica**.
- El disparador pasa de Vercel Cron al sidecar `cron`:

```text
# docker/cron/crontab — 13:00 UTC = 08:00 Lima
0 13 * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" http://bbti-erp:3000/api/cron/alertas-vencimiento
```

- `docker/cron/Dockerfile`: `alpine` + `curl` + crond en foreground.
- `vercel.json` se elimina del repo.

### 8. Variables de entorno

`.env.production.example` (se commitea; el `.env.production` real **nunca** — ya está en `.gitignore` y `.dockerignore`). ⚠️ El `.gitignore` actual tiene `.env*`, que también ignoraría el example: agregar la excepción `!.env.production.example`.

```env
NODE_ENV=production
PORT=3000

# PostgreSQL — local en desarrollo; RDS cuando el ingeniero envíe accesos
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DB_NAME?schema=gestion_proyectos&sslmode=require

# Sesiones JWT (min 32 chars aleatorios)
JWT_SECRET=

# Cloudflare R2 (compatible S3)
R2_ENDPOINT_URL=https://ACCOUNT_ID.r2.cloudflarestorage.com
R2_BUCKET=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_REGION=auto

# Auth del endpoint de cron
CRON_SECRET=
```

- **Desaparecen:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- Todas las variables son server-side puras (no queda ningún `NEXT_PUBLIC_*`), por lo que **no se necesitan build args** en Docker: `env_file` en runtime basta.
- Secretos reales solo en el servidor del ingeniero o CI/CD.

### 9. Dependencias

| Salen | Entran |
|---|---|
| `@supabase/supabase-js` | `prisma` (dev) + `@prisma/client` |
| `@supabase/ssr` | `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` |
| | `bcryptjs` (+ `@types/bcryptjs` dev) |
| | `jose` |

### 10. Despliegue en el servidor del ingeniero (README)

Ruta exacta que seguirá el ingeniero en su Linux:

```bash
git clone https://github.com/mirkovedia/bbti-erp
cd bbti-erp
cp .env.production.example .env.production
# editar .env.production con accesos reales de RDS y R2
docker compose up -d --build
docker compose exec bbti-erp npx prisma migrate deploy
docker compose exec bbti-erp npm run seed
```

**Validación (los comandos del propio paquete del consultor):**

```bash
docker compose build
docker compose up -d
docker logs -f bbti-erp            # arranque limpio
curl http://localhost:3006/api/health
docker exec -it bbti-erp sh
  env | grep DATABASE               # variables presentes
  env | grep R2
```

Abrir `http://localhost:3006` → login con usuario seed.

### 11. Testing y verificación

- **Unit (71):** funciones puras — sobreviven sin cambios (no dependen de Supabase).
- **E2E (6 suites Playwright):** `scripts/lib/supabase-test.mjs` se reemplaza por helper Prisma; `getAuthCookie` pasa a loguearse contra `/api/auth/login`. Misma cobertura: firmas de etapas, regla pago 100%, permisos dinámicos, papelera, notificaciones, cron.
- **Corren contra el stack dockerizado local** (`docker-compose.dev.yml` + app).
- **Prueba de entrega:** clonar el repo público en carpeta limpia y desplegar desde cero siguiendo solo el README (simula la experiencia del ingeniero).

### 12. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Next 16 difiere del conocimiento previo (proxy.ts, deprecaciones) | Regla del repo (AGENTS.md): leer `node_modules/next/dist/docs/` antes de codear |
| JWT en runtime edge | `jose` (no `jsonwebtoken`, que no corre en edge) |
| bcrypt nativo rompe build Alpine | `bcryptjs` (JS puro) |
| Prisma en Alpine/musl | `openssl` en la imagen; binary target `linux-musl-openssl-3.0.x` |
| `?schema=` ignorado si alguien vuelve a `pg` crudo | Decisión documentada: Prisma es la capa DB; no usar `pg` directo |
| CORS del bucket R2 | Checklist explícito con el ingeniero antes del corte |
| Permisos del usuario RDS insuficientes para `migrate deploy` (CREATE SCHEMA) | Confirmar con el ingeniero; fallback: entregarle el SQL generado (`prisma migrate diff`) |
| Secretos del paquete del consultor (host RDS real, key parcial) | Las carpetas del consultor quedan fuera de git (ya están untracked; se agregan a `.gitignore`) |

### 13. Pendientes que dependen del ingeniero

```text
Accesos reales de RDS (host, usuario, clave, DB_NAME definitivo)
Confirmación de SCHEMA_NAME definitivo (default propuesto: gestion_proyectos)
Credenciales R2 reales (endpoint, bucket, keys)
Configuración CORS del bucket R2 (dominio de la app)
Dominio/IP final donde publicará el puerto 3006
```

Ninguno bloquea la implementación: todo se desarrolla y valida contra Postgres local + bucket R2 de prueba, y el corte es solo editar `.env.production`.
