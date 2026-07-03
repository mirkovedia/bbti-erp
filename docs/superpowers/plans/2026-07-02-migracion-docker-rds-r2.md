# Migración Docker + RDS + R2 — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar BBTI ERP de Supabase+Vercel a Docker Compose (puerto 3006) + PostgreSQL (local ahora, AWS RDS al corte) vía Prisma + JWT propio + Cloudflare R2, sin cambiar funcionalidad.

**Architecture:** Monolito Next.js 16 en un contenedor (standalone, non-root) + sidecar cron. Prisma reemplaza supabase-js (un solo cliente server-side; RLS desaparece, la autorización ya se revalida en las rutas API). Auth = JWT (jose) en cookie httpOnly + bcryptjs. Storage = presigned URLs contra R2. Realtime = polling.

**Tech Stack:** Next.js 16.2.6, Prisma 6, PostgreSQL 16, jose, bcryptjs, @aws-sdk/client-s3 + s3-request-presigner, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-07-02-migracion-docker-rds-r2-design.md`

## Global Constraints

- **Next.js 16**: `proxy.ts` (NO `middleware.ts`). Antes de tocar APIs de Next, leer `node_modules/next/dist/docs/` (regla de AGENTS.md).
- **Puertos**: interno `3000`, publicado `3006:3000`.
- **Schema Postgres**: `gestion_proyectos`, vía `DATABASE_URL=...?schema=gestion_proyectos`.
- **Capa DB**: Prisma. PROHIBIDO `pg` crudo (su `?schema=` se ignora silenciosamente).
- **Auth**: `jose` (NO `jsonwebtoken` — no corre en edge) y `bcryptjs` (NO `bcrypt` — binario nativo rompe Alpine).
- **La forma del JSON de las APIs NO cambia**: columnas snake_case, montos como `number`, fechas de negocio como string `YYYY-MM-DD`. El frontend no se toca salvo donde se indica.
- **Tipos en el schema fresco** (decisión de paridad JSON):
  - `numeric(12,2)` → `Float @db.DoublePrecision` (PostgREST ya entregaba JS numbers; Prisma `Decimal` serializaría strings y rompería el frontend).
  - columnas `date` de negocio → `String` (text). La app opera fechas como strings `YYYY-MM-DD` (`aplicarRetraso`, `clasificarVencimiento`); ISO ordena bien lexicográficamente.
  - `timestamptz` → `DateTime @db.Timestamptz(6)`.
- **Toda ruta que antes dependía de RLS para "solo autenticados" DEBE llamar `getSession()`** (GET /api/proyectos, GET /api/proyectos/[id], GET /api/configuracion, GET /api/usuarios no tenían check explícito).
- **Nunca** devolver `password_hash` en respuestas de API (excepción: export de backup, solo Admin).
- Commits en español, convención `feat:/fix:/chore:/refactor:`.
- Variables server-side puras; NINGUNA `NEXT_PUBLIC_*` nueva.
- Los secretos reales nunca se commitean (`.env*` ignorado; solo `.env.production.example`).

## Estructura de archivos (mapa completo)

```text
CREAR:
  docker-compose.dev.yml                Postgres 16 local (dev)
  docker/db/init-schema.sql             CREATE SCHEMA gestion_proyectos
  prisma/schema.prisma                  20 modelos (consolidación de migraciones 001–015)
  prisma/seed.mjs                       usuarios demo (bcryptjs) + config + permisos
  lib/db.ts                             PrismaClient singleton
  lib/auth/session.ts                   JWT: crear/verificar token, getSession()
  lib/auth/permissions-server.ts        getRolePermissionsServer con Prisma (server-only)
  lib/r2/r2Client.ts                    cliente S3 → R2
  lib/r2/r2Storage.ts                   presigned PUT/GET + delete
  app/api/health/route.ts              healthcheck (ping DB)
  app/api/auth/login/route.ts
  app/api/auth/logout/route.ts
  app/api/auth/me/route.ts
  scripts/test-session.ts               unit test del token JWT
  scripts/lib/test-helpers.mjs          reemplazo de supabase-test.mjs (login HTTP + Prisma)
  Dockerfile
  docker-compose.yml
  docker/cron/Dockerfile
  docker/cron/entrypoint.sh
  .dockerignore
  .env.production.example
  .env                                  (local, gitignored) DATABASE_URL para Prisma CLI

MODIFICAR:
  package.json                          deps nuevas, quitar @supabase/*, scripts seed/db
  next.config.ts                        output: "standalone"
  proxy.ts                              jwtVerify en vez de supabase.auth.getUser
  app/(auth)/login/page.tsx             handleSubmit → POST /api/auth/login
  components/layout/Topbar.tsx          handleLogout → POST /api/auth/logout
  app/(dashboard)/layout.tsx            carga por /api/auth/me + APIs existentes
  app/(dashboard)/page.tsx              quitar canal Realtime; chime/destello por diff de polling
  hooks/useNotificaciones.ts            quitar Realtime; polling 20s (misma API del hook)
  lib/notificaciones.ts                 Prisma
  lib/documento-eventos.ts              Prisma
  lib/utils/actividad.ts                Prisma
  lib/utils/upload-documento.ts         PUT directo a URL firmada R2
  lib/auth/permissions.ts               queda client-safe (se le extrae getRolePermissionsServer)
  app/api/proyectos/route.ts            Prisma + getSession
  app/api/proyectos/[id]/route.ts       Prisma + getSession
  app/api/notificaciones/route.ts       Prisma
  app/api/notificaciones/marcar-leidas/route.ts
  app/api/usuarios/route.ts             Prisma + password_hash
  app/api/usuarios/[id]/route.ts        Prisma (+ cambio de contraseña opcional)
  app/api/actividad/route.ts            Prisma
  app/api/productividad/route.ts        Prisma
  app/api/role-permissions/route.ts     Prisma
  app/api/configuracion/route.ts        Prisma
  app/api/configuracion/backup/route.ts Prisma
  app/api/configuracion/restore/route.ts Prisma
  app/api/documentos/route.ts           Prisma (metadatos)
  app/api/documentos/upload-url/route.ts   R2 presigned PUT
  app/api/documentos/download-url/route.ts R2 presigned GET
  app/api/documentos/[id]/route.ts      R2 delete + Prisma
  app/api/documentos/eventos/route.ts   Prisma
  app/api/cron/alertas-vencimiento/route.ts Prisma
  .gitignore                            !.env.production.example
  scripts/e2e-*.mjs, scripts/verify-*.mjs, scripts/test-*.mjs  helper nuevo

ELIMINAR (Task 16):
  lib/supabase/server.ts, lib/supabase/client.ts, lib/supabase/admin.ts
  scripts/lib/supabase-test.mjs, scripts/setup-storage.mjs, scripts/seed.ts, scripts/seed-demo.mjs
  vercel.json
  deps: @supabase/ssr, @supabase/supabase-js
```

**Orden de ejecución:** las Tasks 1–15 conviven con Supabase (la app sigue corriendo con `.env.local` de Supabase mientras se construyen las piezas). El "corte" es la Task 16 (retiro de Supabase) — a partir de ahí la app corre 100% contra Postgres local. Task 17 dockeriza, 18 adapta E2E, 19 documenta la entrega.

---

### Task 1: Postgres local + dependencias + schema Prisma + migración inicial

**Files:**
- Create: `docker-compose.dev.yml`, `docker/db/init-schema.sql`, `prisma/schema.prisma`, `.env`
- Modify: `package.json`

**Interfaces:**
- Produces: BD local `postgresql://postgres:postgres@localhost:5432/bbti?schema=gestion_proyectos` con las 20 tablas; modelos Prisma con nombres de campo idénticos a las columnas actuales (snake_case).

- [ ] **Step 1: docker-compose.dev.yml + init del schema**

`docker-compose.dev.yml`:

```yaml
# Desarrollo local: SOLO la base de datos. La app corre con `npm run dev`.
# Cumple la instrucción del ingeniero: desarrollar contra un Postgres propio
# y tener scripts de migración listos; al llegar los accesos de RDS solo
# cambia DATABASE_URL.
services:
  db:
    image: postgres:16-alpine
    container_name: bbti-db-dev
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: bbti
    ports:
      # 5433 en el host: la máquina de dev tiene un PostgreSQL 18 nativo ocupando 5432
      - "5433:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./docker/db/init-schema.sql:/docker-entrypoint-initdb.d/init-schema.sql
volumes:
  pgdata: {}
```

`docker/db/init-schema.sql`:

```sql
-- Se ejecuta solo en el PRIMER arranque del volumen.
CREATE SCHEMA IF NOT EXISTS gestion_proyectos;
```

- [ ] **Step 2: Levantar la BD y verificar**

```bash
docker compose -f docker-compose.dev.yml up -d
docker exec bbti-db-dev psql -U postgres -d bbti -c "\dn"
```

Expected: lista de schemas incluye `gestion_proyectos`.

- [ ] **Step 3: Instalar dependencias**

```bash
npm install @prisma/client bcryptjs jose @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
npm install -D prisma tsx
```

(`bcryptjs` v3 trae sus propios types; NO instalar `@types/bcryptjs`.)

- [ ] **Step 4: `.env` para el CLI de Prisma** (gitignored por `.env*`; Next también lo lee)

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/bbti?schema=gestion_proyectos
```

- [ ] **Step 5: Escribir `prisma/schema.prisma` completo**

Consolida las migraciones 001–015 sin nada Supabase-specific (sin `auth.users`, sin RLS, sin realtime). `users` gana `password_hash`. Campos = columnas actuales (snake_case) para que el JSON de las APIs no cambie.

```prisma
generator client {
  provider      = "prisma-client-js"
  binaryTargets = ["native", "linux-musl-openssl-3.0.x"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model company_config {
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name         String   @default("BBTI")
  siglas       String?  @default("S.A.C.")
  rubro        String?  @default("Fabricación de Tableros Eléctricos")
  ruc          String?
  direccion    String?
  telefono     String?
  email        String?
  website      String?
  moneda       String?  @default("S/")
  igv          String?  @default("18")
  orden_prefix String?  @default("PR")
  dias_alerta  Int?     @default(7)
  updated_at   DateTime @default(now()) @db.Timestamptz(6)
}

model users {
  id             String           @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  nombre         String
  email          String           @unique
  area           String
  rol            String
  activo         Boolean          @default(true)
  password_hash  String
  created_at     DateTime         @default(now()) @db.Timestamptz(6)
  notificaciones notificaciones[]
  proyectos      proyectos[]
}

model proyectos {
  id               String                       @id
  cliente          String
  fecha_creacion   String
  monto            Float                        @default(0) @db.DoublePrecision
  usuario_id       String?                      @db.Uuid
  usuario_nombre   String?
  estado           String                       @default("EN INGENIERÍA")
  activo           Boolean                      @default(true)
  created_at       DateTime                     @default(now()) @db.Timestamptz(6)
  updated_at       DateTime                     @default(now()) @db.Timestamptz(6)
  usuario          users?                       @relation(fields: [usuario_id], references: [id])
  comercial        proyecto_comercial?
  ingenieria       proyecto_ingenieria?
  materiales       proyecto_materiales[]
  produccion       proyecto_produccion?
  etapas           proyecto_etapas[]
  finanzas         proyecto_finanzas?
  pagos            proyecto_pagos[]
  comentarios      proyecto_comentarios[]
  observaciones    proyecto_observaciones[]
  documentos       proyecto_documentos[]
  confirmaciones   proyecto_confirmaciones[]
  alertas          alertas[]
  alertas_enviadas proyecto_alertas_enviadas[]
  notificaciones   notificaciones[]

  @@index([estado])
  @@index([usuario_id])
  @@index([activo])
}

model proyecto_comercial {
  id              String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  proyecto_id     String    @unique
  fecha_entrega   String?
  dias_plazo      Int?
  adelanto        Float?    @default(0) @db.DoublePrecision
  adelanto_fijado Boolean?  @default(false)
  metrado         String?
  alerta          String?
  updated_at      DateTime  @default(now()) @db.Timestamptz(6)
  proyecto        proyectos @relation(fields: [proyecto_id], references: [id], onDelete: Cascade)
}

model proyecto_ingenieria {
  id            String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  proyecto_id   String    @unique
  estado_planos String?   @default("Solicitud de planos")
  updated_at    DateTime  @default(now()) @db.Timestamptz(6)
  proyecto      proyectos @relation(fields: [proyecto_id], references: [id], onDelete: Cascade)
}

model proyecto_materiales {
  id              String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  proyecto_id     String
  nombre          String
  cantidad        Int?      @default(0)
  unidad          String?   @default("und")
  comprado        Int?      @default(0)
  estado          String?   @default("PENDIENTE")
  codigo          String?
  precio_unitario Float?    @default(0) @db.DoublePrecision
  proyecto        proyectos @relation(fields: [proyecto_id], references: [id], onDelete: Cascade)

  @@index([proyecto_id])
}

model proyecto_produccion {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  proyecto_id String    @unique
  progreso    Int?      @default(0)
  pruebas     Boolean?  @default(false)
  envio       Boolean?  @default(false)
  updated_at  DateTime  @default(now()) @db.Timestamptz(6)
  proyecto    proyectos @relation(fields: [proyecto_id], references: [id], onDelete: Cascade)
}

model proyecto_etapas {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  proyecto_id String
  nombre      String
  orden       Int
  estado      String?   @default("PENDIENTE")
  proyecto    proyectos @relation(fields: [proyecto_id], references: [id], onDelete: Cascade)

  @@index([proyecto_id])
}

model proyecto_finanzas {
  id             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  proyecto_id    String    @unique
  adelanto       Float?    @default(0) @db.DoublePrecision
  fecha_adelanto String?
  porcentaje     Int?      @default(0)
  forma_pago     String?
  alerta         String?
  updated_at     DateTime  @default(now()) @db.Timestamptz(6)
  proyecto       proyectos @relation(fields: [proyecto_id], references: [id], onDelete: Cascade)
}

model proyecto_pagos {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  proyecto_id String
  descripcion String?
  monto       Float?    @db.DoublePrecision
  fecha       String?
  created_at  DateTime  @default(now()) @db.Timestamptz(6)
  proyecto    proyectos @relation(fields: [proyecto_id], references: [id], onDelete: Cascade)

  @@index([proyecto_id])
}

model proyecto_comentarios {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  proyecto_id String
  autor       String
  texto       String
  fecha       String
  created_at  DateTime  @default(now()) @db.Timestamptz(6)
  proyecto    proyectos @relation(fields: [proyecto_id], references: [id], onDelete: Cascade)

  @@index([proyecto_id])
}

model proyecto_observaciones {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  proyecto_id String
  autor       String
  texto       String
  fecha       String
  created_at  DateTime  @default(now()) @db.Timestamptz(6)
  proyecto    proyectos @relation(fields: [proyecto_id], references: [id], onDelete: Cascade)

  @@index([proyecto_id])
}

model proyecto_documentos {
  id             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  proyecto_id    String
  nombre         String
  tipo           String?
  storage_path   String?
  subido_por     String?
  subido_por_rol String?
  estado         String?
  created_at     DateTime  @default(now()) @db.Timestamptz(6)
  proyecto       proyectos @relation(fields: [proyecto_id], references: [id], onDelete: Cascade)

  @@index([proyecto_id])
}

model alertas {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  proyecto_id String?
  tipo        String?
  mensaje     String
  leida       Boolean?  @default(false)
  created_at  DateTime  @default(now()) @db.Timestamptz(6)
  proyecto    proyectos? @relation(fields: [proyecto_id], references: [id], onDelete: Cascade)

  @@index([proyecto_id])
  @@index([leida])
}

model proyecto_confirmaciones {
  proyecto_id    String
  etapa          String
  confirmada_por String?
  confirmada_at  DateTime  @default(now()) @db.Timestamptz(6)
  proyecto       proyectos @relation(fields: [proyecto_id], references: [id], onDelete: Cascade)

  @@id([proyecto_id, etapa])
}

model notificaciones {
  id              String     @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  destinatario_id String     @db.Uuid
  proyecto_id     String?
  tipo            String
  mensaje         String
  actor           String?
  leida           Boolean?   @default(false)
  created_at      DateTime   @default(now()) @db.Timestamptz(6)
  destinatario    users      @relation(fields: [destinatario_id], references: [id], onDelete: Cascade)
  proyecto        proyectos? @relation(fields: [proyecto_id], references: [id], onDelete: Cascade)

  @@index([destinatario_id, leida])
}

model documento_eventos {
  id               String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  documento_id     String?  @db.Uuid
  proyecto_id      String?
  documento_nombre String
  tipo             String
  usuario          String?
  rol              String?
  created_at       DateTime @default(now()) @db.Timestamptz(6)

  @@index([created_at(sort: Desc)])
}

model actividad_log {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  proyecto_id String?
  cliente     String?
  usuario     String
  rol         String
  accion      String
  detalle     String
  created_at  DateTime @default(now()) @db.Timestamptz(6)

  @@index([created_at(sort: Desc)])
}

model role_permissions {
  rol         String   @id
  permissions Json
  updated_at  DateTime @default(now()) @db.Timestamptz(6)
}

model proyecto_alertas_enviadas {
  id          Int       @id @default(autoincrement())
  proyecto_id String
  tipo        String
  enviada_at  DateTime  @default(now()) @db.Timestamptz(6)
  proyecto    proyectos @relation(fields: [proyecto_id], references: [id], onDelete: Cascade)

  @@unique([proyecto_id, tipo])
}
```

Notas de diseño (documentadas aquí para el implementador):
- `documento_eventos` y `actividad_log` NO tienen FK a propósito (los eventos sobreviven al borrado — decisión de migración 008/013).
- El CHECK de `etapa`/`tipo` de las migraciones se pierde; la app ya valida contra `FLOW_ETAPAS` server-side.
- `orden_prefix` default "PR" (el seed real de producción usaba PR, no OC).

- [ ] **Step 6: Generar la migración inicial y el cliente**

```bash
npx prisma migrate dev --name init
```

Expected: crea `prisma/migrations/<timestamp>_init/migration.sql` y aplica sin errores; `Prisma Client generated`.

- [ ] **Step 7: Verificar tablas en el schema correcto**

```bash
docker exec bbti-db-dev psql -U postgres -d bbti -c "\dt gestion_proyectos.*"
```

Expected: las 20 tablas + `_prisma_migrations`, TODAS bajo `gestion_proyectos` (ninguna en `public`).

- [ ] **Step 8: Commit**

```bash
git add docker-compose.dev.yml docker/db/init-schema.sql prisma/ package.json package-lock.json
git commit -m "feat: Postgres local + schema Prisma consolidado (migraciones 001-015, schema gestion_proyectos)"
```

---

### Task 2: Cliente Prisma singleton + endpoint de health

**Files:**
- Create: `lib/db.ts`, `app/api/health/route.ts`

**Interfaces:**
- Produces: `import { prisma } from '@/lib/db'` — instancia única de `PrismaClient`. `GET /api/health` → `{ status: 'OK', db: true, timestamp }` (200) o 503.

- [ ] **Step 1: `lib/db.ts`**

```ts
import { PrismaClient } from '@prisma/client';

// Singleton: en dev el hot-reload re-evalúa módulos; guardamos la instancia
// en globalThis para no agotar conexiones.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```

- [ ] **Step 2: `app/api/health/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// Healthcheck para Docker (docker-compose healthcheck) y monitoreo.
// Sin auth: no expone datos, solo estado.
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: 'OK', db: true, timestamp: new Date().toISOString() });
  } catch {
    return NextResponse.json(
      { status: 'ERROR', db: false, timestamp: new Date().toISOString() },
      { status: 503 }
    );
  }
}
```

- [ ] **Step 3: Verificar**

```bash
npm run dev   # en otra terminal
curl -s http://localhost:3000/api/health
```

Expected: `{"status":"OK","db":true,...}`. Apagar la BD (`docker compose -f docker-compose.dev.yml stop db`) y repetir → 503. Volver a levantarla.

- [ ] **Step 4: Commit**

```bash
git add lib/db.ts app/api/health/route.ts
git commit -m "feat: cliente Prisma singleton y endpoint /api/health con ping a BD"
```

---

### Task 3: Seed reproducible (usuarios demo + config + permisos)

**Files:**
- Create: `prisma/seed.mjs`
- Modify: `package.json` (script `seed`)

**Interfaces:**
- Consumes: `@prisma/client`, `bcryptjs`.
- Produces: comando `npm run seed` idempotente. 7 usuarios demo con `password_hash`, 1 fila `company_config`, 8 filas `role_permissions`.

- [ ] **Step 1: `prisma/seed.mjs`** (JS plano: corre con `node` dentro del contenedor, sin tsx)

```js
// Seed idempotente: usuarios demo, configuración de empresa y permisos por rol.
// Local:      npm run seed
// Contenedor: docker compose exec bbti-erp node prisma/seed.mjs
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const seedUsers = [
  { nombre: 'José Flores', email: 'jflores@bbti.com.pe', area: 'Comercial', rol: 'Comercial', password: 'jflores03' },
  { nombre: 'Néstor Ormeño', email: 'normeno@bbti.com.pe', area: 'Comercial', rol: 'Comercial', password: 'nestoro' },
  { nombre: 'Giancarlos Oscco', email: 'ingenieria@bbti.com.pe', area: 'Ingeniería', rol: 'Ingeniería', password: 'goscco' },
  { nombre: 'Carlos Ramírez', email: 'logistica@bbti.com.pe', area: 'Logística', rol: 'Logística', password: 'carlosr' },
  { nombre: 'Ana Torres', email: 'produccion@bbti.com.pe', area: 'Producción', rol: 'Producción', password: 'anat' },
  { nombre: 'Rosa Medina', email: 'finanzas@bbti.com.pe', area: 'Finanzas', rol: 'Finanzas', password: 'rosam' },
  { nombre: 'Admin Sistema', email: 'admin@bbti.com.pe', area: 'Administración', rol: 'Administrador', password: 'admin2024' },
];

// Misma matriz que lib/auth/permissions.ts (fuente: migración 011)
const seedPermissions = {
  Administrador: { canCreate: true, canEdit: true, canDelete: true, canManageUsers: true, canConfig: true, canViewReports: true, canViewFinance: true, canEditFinance: true, canEditProduccion: true, canEditLogistica: true, canEditIngenieria: true, canEditComercial: true, canExport: true },
  'Gerencia General': { canCreate: false, canEdit: false, canDelete: false, canManageUsers: false, canConfig: false, canViewReports: true, canViewFinance: true, canEditFinance: false, canEditProduccion: false, canEditLogistica: false, canEditIngenieria: false, canEditComercial: false, canExport: true },
  Comercial: { canCreate: true, canEdit: true, canDelete: true, canManageUsers: false, canConfig: false, canViewReports: true, canViewFinance: true, canEditFinance: false, canEditProduccion: false, canEditLogistica: false, canEditIngenieria: false, canEditComercial: true, canExport: true },
  'Ingeniería': { canCreate: true, canEdit: false, canDelete: true, canManageUsers: false, canConfig: false, canViewReports: false, canViewFinance: true, canEditFinance: false, canEditProduccion: false, canEditLogistica: false, canEditIngenieria: true, canEditComercial: false, canExport: true },
  'Logística': { canCreate: false, canEdit: false, canDelete: false, canManageUsers: false, canConfig: false, canViewReports: false, canViewFinance: true, canEditFinance: false, canEditProduccion: false, canEditLogistica: true, canEditIngenieria: false, canEditComercial: false, canExport: true },
  'Producción': { canCreate: false, canEdit: false, canDelete: false, canManageUsers: false, canConfig: false, canViewReports: false, canViewFinance: true, canEditFinance: false, canEditProduccion: true, canEditLogistica: false, canEditIngenieria: false, canEditComercial: false, canExport: false },
  Finanzas: { canCreate: false, canEdit: false, canDelete: false, canManageUsers: false, canConfig: false, canViewReports: true, canViewFinance: true, canEditFinance: true, canEditProduccion: false, canEditLogistica: false, canEditIngenieria: false, canEditComercial: false, canExport: true },
  'Solo Lectura': { canCreate: false, canEdit: false, canDelete: false, canManageUsers: false, canConfig: false, canViewReports: false, canViewFinance: true, canEditFinance: false, canEditProduccion: false, canEditLogistica: false, canEditIngenieria: false, canEditComercial: false, canExport: false },
};

async function main() {
  console.log('🌱 Seed BBTI ERP...');

  for (const u of seedUsers) {
    const password_hash = await bcrypt.hash(u.password, 10);
    await prisma.users.upsert({
      where: { email: u.email },
      update: {},
      create: { nombre: u.nombre, email: u.email, area: u.area, rol: u.rol, activo: true, password_hash },
    });
    console.log(`✅ ${u.nombre} (${u.rol})`);
  }

  const existing = await prisma.company_config.findFirst();
  if (!existing) {
    await prisma.company_config.create({
      data: { name: 'BBTI', siglas: 'S.A.C.', rubro: 'Fabricación de Tableros Eléctricos Industriales', moneda: 'S/', igv: '18', orden_prefix: 'PR', dias_alerta: 7 },
    });
    console.log('✅ company_config');
  }

  for (const [rol, permissions] of Object.entries(seedPermissions)) {
    await prisma.role_permissions.upsert({
      where: { rol },
      update: { permissions },
      create: { rol, permissions },
    });
  }
  console.log('✅ role_permissions (8 roles)');
  console.log('🎉 Seed completado.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Script en package.json** — añadir a `"scripts"`:

```json
"seed": "node prisma/seed.mjs"
```

- [ ] **Step 3: Ejecutar y verificar (idempotencia incluida)**

```bash
npm run seed
npm run seed
docker exec bbti-db-dev psql -U postgres -d bbti -c "SELECT count(*) FROM gestion_proyectos.users; SELECT count(*) FROM gestion_proyectos.role_permissions;"
```

Expected: 7 usuarios y 8 roles (no duplicados tras la segunda corrida).

- [ ] **Step 4: Commit**

```bash
git add prisma/seed.mjs package.json
git commit -m "feat: seed reproducible con bcryptjs (usuarios demo, config, permisos)"
```

---

### Task 4: Sesión JWT (lib/auth/session.ts) — TDD

**Files:**
- Create: `lib/auth/session.ts`, `scripts/test-session.ts`

**Interfaces:**
- Produces (las usan Tasks 5–15):
  - `SESSION_COOKIE = 'bbti_session'`
  - `createSessionToken(p: SessionPayload): Promise<string>`
  - `verifySessionToken(token: string): Promise<SessionPayload | null>`
  - `getSession(): Promise<SessionPayload | null>` — lee la cookie con `next/headers`
  - `interface SessionPayload { sub: string; rol: string; nombre: string }`

- [ ] **Step 1: Escribir el test que falla** — `scripts/test-session.ts` (estilo de tests del repo: asserts + exit code)

```ts
/**
 * Unit tests del token de sesión JWT.
 * Ejecutar: JWT_SECRET=un_secreto_de_al_menos_32_caracteres!! npx tsx scripts/test-session.ts
 */
import { createSessionToken, verifySessionToken } from '../lib/auth/session';

let pass = 0, fail = 0;
const assert = (cond: boolean, msg: string) => {
  if (cond) { pass++; console.log(`  ✅ ${msg}`); }
  else { fail++; console.error(`  ❌ ${msg}`); }
};

async function main() {
  const payload = { sub: 'user-123', rol: 'Administrador', nombre: 'Admin Sistema' };

  const token = await createSessionToken(payload);
  assert(typeof token === 'string' && token.split('.').length === 3, 'genera un JWT de 3 partes');

  const back = await verifySessionToken(token);
  assert(back !== null, 'el token propio verifica');
  assert(back?.sub === 'user-123', 'round-trip de sub');
  assert(back?.rol === 'Administrador', 'round-trip de rol');
  assert(back?.nombre === 'Admin Sistema', 'round-trip de nombre');

  const [h, p, s] = token.split('.');
  const tampered = await verifySessionToken(`${h}.${p}.${s.slice(0, -2)}xx`);
  assert(tampered === null, 'firma alterada → null (no lanza)');

  assert((await verifySessionToken('basura')) === null, 'token malformado → null');
  assert((await verifySessionToken('')) === null, 'token vacío → null');

  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail > 0 ? 1 : 0);
}
main();
```

- [ ] **Step 2: Correrlo — debe fallar** (módulo no existe)

```bash
JWT_SECRET=un_secreto_de_al_menos_32_caracteres!! npx tsx scripts/test-session.ts
```

Expected: error `Cannot find module '../lib/auth/session'`.

- [ ] **Step 3: Implementar `lib/auth/session.ts`**

```ts
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

export const SESSION_COOKIE = 'bbti_session';

export interface SessionPayload {
  sub: string;    // id del usuario (uuid)
  rol: string;
  nombre: string;
}

const getSecret = (): Uint8Array => {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) {
    throw new Error('JWT_SECRET debe existir y tener al menos 32 caracteres');
  }
  return new TextEncoder().encode(s);
};

export const createSessionToken = async (p: SessionPayload): Promise<string> =>
  new SignJWT({ rol: p.rol, nombre: p.nombre })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(p.sub)
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getSecret());

export const verifySessionToken = async (token: string): Promise<SessionPayload | null> => {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (!payload.sub) return null;
    return { sub: payload.sub, rol: String(payload.rol ?? ''), nombre: String(payload.nombre ?? '') };
  } catch {
    return null;
  }
};

/** Sesión del request actual (API routes / Server Components). null si no hay o es inválida. */
export const getSession = async (): Promise<SessionPayload | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
};
```

- [ ] **Step 4: Correr el test — debe pasar** (mismo comando). Expected: `8 pass, 0 fail`.

- [ ] **Step 5: Commit**

```bash
git add lib/auth/session.ts scripts/test-session.ts
git commit -m "feat: sesión JWT con jose (crear/verificar token, getSession) + unit tests"
```

---

### Task 5: Endpoints de auth (login / logout / me)

**Files:**
- Create: `app/api/auth/login/route.ts`, `app/api/auth/logout/route.ts`, `app/api/auth/me/route.ts`

**Interfaces:**
- Consumes: `prisma` (Task 2), `createSessionToken`/`getSession`/`SESSION_COOKIE` (Task 4).
- Produces: `POST /api/auth/login {email,password}` → 200 `{ user }` + Set-Cookie | 401. `POST /api/auth/logout` → borra cookie. `GET /api/auth/me` → `{ user }` (perfil completo SIN hash) | 401.
- Cookie: httpOnly, sameSite lax, path /, maxAge 7d, `secure` según `COOKIE_SECURE === 'true'` (default false: la validación del consultor es http://localhost:3006 sin TLS).

- [ ] **Step 1: `app/api/auth/login/route.ts`**

```ts
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { createSessionToken, SESSION_COOKIE } from '@/lib/auth/session';

const MAX_AGE = 60 * 60 * 24 * 7; // 7 días, igual que la expiración del JWT

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!email || !password) {
      return NextResponse.json({ error: 'Email y contraseña requeridos' }, { status: 400 });
    }

    const user = await prisma.users.findUnique({ where: { email } });
    // Mensaje idéntico exista o no el usuario (no filtrar cuáles emails existen)
    if (!user || user.activo === false || !(await bcrypt.compare(password, user.password_hash))) {
      return NextResponse.json({ error: 'Credenciales incorrectas' }, { status: 401 });
    }

    const token = await createSessionToken({ sub: user.id, rol: user.rol, nombre: user.nombre });
    const res = NextResponse.json({
      user: { id: user.id, nombre: user.nombre, email: user.email, area: user.area, rol: user.rol, activo: user.activo, created_at: user.created_at },
    });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.COOKIE_SECURE === 'true',
      path: '/',
      maxAge: MAX_AGE,
    });
    return res;
  } catch (err) {
    console.error('POST /api/auth/login error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
```

- [ ] **Step 2: `app/api/auth/logout/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth/session';

export async function POST() {
  const res = NextResponse.json({ success: true });
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 });
  return res;
}
```

- [ ] **Step 3: `app/api/auth/me/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';

// Perfil del usuario de la sesión. Reemplaza la lectura directa de `users`
// que el layout hacía con supabase-js desde el navegador.
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const user = await prisma.users.findUnique({
      where: { id: session.sub },
      select: { id: true, nombre: true, email: true, area: true, rol: true, activo: true, created_at: true },
    });
    if (!user || user.activo === false) {
      return NextResponse.json({ error: 'Usuario no válido' }, { status: 401 });
    }
    return NextResponse.json({ user });
  } catch (err) {
    console.error('GET /api/auth/me error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Verificar con curl** (dev server corriendo; `JWT_SECRET` en `.env`)

Añadir a `.env`:

```env
JWT_SECRET=cambia_esto_por_32_caracteres_minimo_dev!!
```

```bash
curl -si -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"email":"admin@bbti.com.pe","password":"admin2024"}'
# Expected: 200, Set-Cookie: bbti_session=...; body con user sin password_hash

curl -si -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"email":"admin@bbti.com.pe","password":"mala"}'
# Expected: 401

curl -si http://localhost:3000/api/auth/me -H "Cookie: bbti_session=<token de arriba>"
# Expected: 200 con el perfil
```

- [ ] **Step 5: Commit**

```bash
git add app/api/auth/
git commit -m "feat: endpoints de auth propios (login bcryptjs, logout, me) con cookie httpOnly"
```

---

### Task 6: proxy.ts → verificación JWT (runtime edge)

**Files:**
- Modify: `proxy.ts` (reemplazo completo)

**Interfaces:**
- Consumes: cookie `bbti_session`, `JWT_SECRET`.
- Preserva EXACTO el comportamiento actual: bypass de `/api/cron/*`, redirect a /login si no hay sesión (excepto `/login` y `/`), mismo matcher.

- [ ] **Step 1: Reescribir `proxy.ts`**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const SESSION_COOKIE = 'bbti_session';
// jose funciona en runtime edge (jsonwebtoken NO — por eso se eligió jose).

export async function proxy(request: NextRequest) {
  // Los endpoints de cron se autentican con CRON_SECRET en su propio handler,
  // no con la sesión; deben saltarse el guard de redirección a /login.
  if (request.nextUrl.pathname.startsWith('/api/cron')) {
    return NextResponse.next({ request });
  }

  let autenticado = false;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token && process.env.JWT_SECRET) {
    try {
      await jwtVerify(token, new TextEncoder().encode(process.env.JWT_SECRET));
      autenticado = true;
    } catch {
      autenticado = false; // token vencido o alterado → tratar como anónimo
    }
  }

  if (
    !autenticado &&
    !request.nextUrl.pathname.startsWith('/login') &&
    request.nextUrl.pathname !== '/'
  ) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  return NextResponse.next({ request });
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
```

- [ ] **Step 2: Verificar**

```bash
curl -si http://localhost:3000/proyectos | head -3
# Expected: 307 → /login (sin cookie)
curl -si http://localhost:3000/proyectos -H "Cookie: bbti_session=<token válido>" | head -3
# Expected: 200
curl -si http://localhost:3000/api/cron/alertas-vencimiento | head -3
# Expected: 401 del handler (NO redirect 307) — el bypass sigue vivo
```

- [ ] **Step 3: Commit**

```bash
git add proxy.ts
git commit -m "feat: proxy verifica sesión JWT propia (jose) en vez de Supabase Auth"
```

---

### Task 7: Frontend de auth (login, logout, carga del layout)

**Files:**
- Modify: `app/(auth)/login/page.tsx` (solo `handleSubmit`), `components/layout/Topbar.tsx` (solo `handleLogout` e imports), `app/(dashboard)/layout.tsx` (solo el `useEffect` de carga e imports)

**Interfaces:**
- Consumes: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `GET /api/role-permissions`, `GET /api/configuracion` (los dos últimos ya existen).

- [ ] **Step 1: `app/(auth)/login/page.tsx`** — quitar `import { createClient } from '@/lib/supabase/client';` y reemplazar `handleSubmit`:

```tsx
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        setError('Credenciales incorrectas. Verifica tu email y contraseña.');
        return;
      }
      router.push('/proyectos');
      router.refresh();
    } catch {
      setError('Error al conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  };
```

(El JSX no se toca.)

- [ ] **Step 2: `components/layout/Topbar.tsx`** — quitar `import { createClient } from '@/lib/supabase/client';` y reemplazar `handleLogout`:

```tsx
  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    router.push('/login');
  };
```

- [ ] **Step 3: `app/(dashboard)/layout.tsx`** — quitar `import { createClient } from '@/lib/supabase/client';` y reemplazar el `useEffect` de carga (el resto del componente no cambia):

```tsx
  useEffect(() => {
    const loadData = async () => {
      // Perfil, permisos y configuración vía API (ya no hay cliente de BD en el navegador).
      const meRes = await fetch('/api/auth/me');
      if (!meRes.ok) {
        setUser(null);
        router.push('/login');
        return;
      }
      const { user: perfil } = await meRes.json();

      const yaCargado = !!user && user.id === perfil.id;
      const [permsRes, configRes] = await Promise.all([
        fetch('/api/role-permissions'),
        fetch('/api/configuracion'),
      ]);

      if (permsRes.ok) {
        const permsMap = (await permsRes.json()) as Record<Rol, Permissions>;
        useAppStore.getState().setRolePermissions(permsMap);
      }

      if (configRes.ok) {
        const configData = await configRes.json();
        useAppStore.getState().setCompanyConfig(
          configData.moneda || 'S/',
          Number(configData.igv) || 18
        );
      }

      if (!yaCargado) {
        setUser(perfil);
      }
    };

    loadData();
  }, [user, setUser, router]);
```

Nota: `GET /api/role-permissions` ya devuelve el mapa completo (rellenado con `PERMS`) — el layout ya no necesita reducir filas.

- [ ] **Step 4: Verificar a mano** — con el dev server: login con `admin@bbti.com.pe / admin2024` → entra al dashboard; logout → vuelve a /login; login con clave errada → mensaje de error. NOTA: en este punto /api/role-permissions y /api/configuracion aún corren sobre Supabase — deben seguir funcionando (transición conviviendo).

- [ ] **Step 5: Commit**

```bash
git add "app/(auth)/login/page.tsx" components/layout/Topbar.tsx "app/(dashboard)/layout.tsx"
git commit -m "feat: frontend de auth contra endpoints propios (login/logout/me)"
```

---

### Task 8: Helpers server a Prisma (permisos, notificaciones, bitácoras)

**Files:**
- Create: `lib/auth/permissions-server.ts`
- Modify: `lib/auth/permissions.ts` (quitar `getRolePermissionsServer` y el import de `SupabaseClient`), `lib/notificaciones.ts`, `lib/utils/actividad.ts`, `lib/documento-eventos.ts`

**Interfaces:**
- Produces (las consumen Tasks 9–15):
  - `getRolePermissionsServer(): Promise<Record<Rol, Permissions>>` — **SIN parámetro** (antes recibía el cliente supabase; actualizar TODOS los call sites cuando se migre cada ruta).
  - `notificar(input: NotificarInput): Promise<void>` — misma firma.
  - `registrarActividad(params)` — misma firma.
  - `logDocumentoEvento(e: DocEventoInput)` — misma firma.

- [ ] **Step 1: `lib/auth/permissions-server.ts`** (server-only; NO importar desde componentes client)

```ts
import { prisma } from '@/lib/db';
import { PERMS } from '@/lib/auth/permissions';
import type { Rol, Permissions } from '@/types';

// Permisos dinámicos desde BD con fallback a la matriz estática.
// Vive en archivo aparte porque lib/auth/permissions.ts se importa desde
// componentes client (usa Zustand) y no puede arrastrar Prisma al bundle.
export const getRolePermissionsServer = async (): Promise<Record<Rol, Permissions>> => {
  try {
    const data = await prisma.role_permissions.findMany({ select: { rol: true, permissions: true } });
    if (data.length === 0) return PERMS;
    const map = {} as Record<Rol, Permissions>;
    for (const r of data) {
      map[r.rol as Rol] = r.permissions as unknown as Permissions;
    }
    for (const r of Object.keys(PERMS) as Rol[]) {
      if (!map[r]) map[r] = PERMS[r];
    }
    return map;
  } catch {
    return PERMS;
  }
};
```

- [ ] **Step 2: `lib/auth/permissions.ts`** — eliminar `import type { SupabaseClient }...` y la función `getRolePermissionsServer` completa (líneas 99–120). `PERMS`, `can` y `checkUploadPermission` quedan intactos.

- [ ] **Step 3: `lib/utils/actividad.ts`** — reemplazo completo:

```ts
import { prisma } from '@/lib/db';

/**
 * Registra un evento en la bitácora general (Command Center).
 * Nunca lanza: un fallo al registrar no debe romper la acción principal.
 */
export async function registrarActividad(params: {
  proyectoId?: string | null;
  cliente?: string | null;
  usuario: string;
  rol: string;
  accion: string;
  detalle: string;
}) {
  try {
    await prisma.actividad_log.create({
      data: {
        proyecto_id: params.proyectoId || null,
        cliente: params.cliente || null,
        usuario: params.usuario,
        rol: params.rol,
        accion: params.accion,
        detalle: params.detalle,
      },
    });
  } catch (err) {
    console.error('Error al registrar actividad:', err);
  }
}
```

- [ ] **Step 4: `lib/notificaciones.ts`** — cambiar SOLO el import y el cuerpo de `notificar` (las funciones puras `rolDelAreaDeEtapa`, `rolesParaConfirmacion`, `mensajeConfirmacion` y la interfaz no cambian):

```ts
import { prisma } from '@/lib/db';
// (se elimina el import de createAdminClient)

export const notificar = async (input: NotificarInput): Promise<void> => {
  try {
    if (input.rolesDestino.length === 0) return;
    const users = await prisma.users.findMany({
      where: { rol: { in: input.rolesDestino }, activo: true },
      select: { id: true },
    });
    const destinatarios = users.filter((u) => u.id !== input.actorId);
    if (destinatarios.length === 0) return;
    await prisma.notificaciones.createMany({
      data: destinatarios.map((u) => ({
        destinatario_id: u.id,
        proyecto_id: input.proyectoId,
        tipo: input.tipo,
        mensaje: input.mensaje,
        actor: input.actorNombre ?? null,
      })),
    });
  } catch (err) {
    console.error('notificar error:', err);
  }
};
```

- [ ] **Step 5: `lib/documento-eventos.ts`** — mismo tratamiento (import de prisma; interfaz intacta):

```ts
import { prisma } from '@/lib/db';
import { registrarActividad } from '@/lib/utils/actividad';

export interface DocEventoInput {
  documentoId?: string | null;
  proyectoId?: string | null;
  documentoNombre: string;
  tipo: 'subida' | 'descarga' | 'eliminacion';
  usuario?: string | null;
  rol?: string | null;
}

export const logDocumentoEvento = async (e: DocEventoInput): Promise<void> => {
  try {
    await prisma.documento_eventos.create({
      data: {
        documento_id: e.documentoId ?? null,
        proyecto_id: e.proyectoId ?? null,
        documento_nombre: e.documentoNombre,
        tipo: e.tipo,
        usuario: e.usuario ?? null,
        rol: e.rol ?? null,
      },
    });

    if (e.proyectoId && (e.tipo === 'subida' || e.tipo === 'eliminacion')) {
      const proy = await prisma.proyectos.findUnique({
        where: { id: e.proyectoId },
        select: { cliente: true },
      });
      const verb = e.tipo === 'subida' ? 'subió el documento' : 'eliminó el documento';
      await registrarActividad({
        proyectoId: e.proyectoId,
        cliente: proy?.cliente || null,
        usuario: e.usuario ?? 'Sistema',
        rol: e.rol ?? 'Sistema',
        accion: e.tipo === 'subida' ? 'documento_subida' : 'documento_eliminacion',
        detalle: `${verb} "${e.documentoNombre}"`,
      });
    }
  } catch (err) {
    console.error('logDocumentoEvento error:', err);
  }
};
```

- [ ] **Step 6: Compilar** — `npx tsc --noEmit`. Expected: errores SOLO en las rutas que aún llaman `getRolePermissionsServer(supabase)` con argumento (se corrigen en Tasks 9–13; anotarlas). Cero errores en los 4 archivos tocados.

- [ ] **Step 7: Commit**

```bash
git add lib/auth/permissions-server.ts lib/auth/permissions.ts lib/notificaciones.ts lib/utils/actividad.ts lib/documento-eventos.ts
git commit -m "refactor: helpers server (permisos, notificaciones, bitacoras) a Prisma"
```

---

### Task 9: /api/proyectos (GET + POST) a Prisma

**Files:**
- Modify: `app/api/proyectos/route.ts` (reemplazo completo)

**Interfaces:**
- Consumes: `prisma`, `getSession`, `getRolePermissionsServer()` (sin args), `notificar`, `registrarActividad`, funciones puras de `estado-proyecto`.
- Produces: mismas respuestas JSON de hoy (lista con `comercial`, `produccion`, `confirmaciones` embebidos y overlay de retraso; POST 201 con el proyecto).

- [ ] **Step 1: Reescribir `app/api/proyectos/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { getRolePermissionsServer } from '@/lib/auth/permissions-server';
import { aplicarRetraso, computeEstadoFromConfirmaciones, type EtapaFlujo } from '@/lib/utils/estado-proyecto';
import { notificar } from '@/lib/notificaciones';
import { registrarActividad } from '@/lib/utils/actividad';
import type { Rol } from '@/types';

export async function GET(request: Request) {
  try {
    // Antes protegido por RLS; con Prisma el check de sesión es explícito.
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const verPapelera = new URL(request.url).searchParams.get('papelera') === '1';

    const proyectos = await prisma.proyectos.findMany({
      where: { activo: !verPapelera },
      include: {
        comercial: { select: { fecha_entrega: true, dias_plazo: true, adelanto: true, adelanto_fijado: true, metrado: true, alerta: true } },
        produccion: { select: { progreso: true } },
        confirmaciones: { select: { etapa: true, confirmada_por: true, confirmada_at: true } },
      },
      orderBy: { created_at: 'desc' },
    });

    const hoy = new Date().toISOString().split('T')[0];
    const formatted = proyectos.map((p) => {
      const confirmadas = new Set<EtapaFlujo>(p.confirmaciones.map((c) => c.etapa as EtapaFlujo));
      const estadoBase = computeEstadoFromConfirmaciones(confirmadas);
      return { ...p, estado: aplicarRetraso(estadoBase, p.comercial?.fecha_entrega, hoy) };
    });

    return NextResponse.json(formatted);
  } catch (err) {
    console.error('GET /api/proyectos error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const body = await request.json();
    if (typeof body.cliente !== 'string' || !body.cliente.trim()) {
      return NextResponse.json({ error: 'El cliente es requerido', code: 'VALIDATION_ERROR' }, { status: 400 });
    }

    const config = await prisma.company_config.findFirst({ select: { orden_prefix: true } });
    const prefix = config?.orden_prefix || 'PR';

    // ID por máximo correlativo del año (evita colisiones tras borrados)
    const year = new Date().getFullYear();
    const delAnio = await prisma.proyectos.findMany({
      where: { id: { startsWith: `${prefix}-`, endsWith: `-${year}` } },
      select: { id: true },
    });
    const maxCorrelativo = delAnio.reduce((max, p) => {
      const parts = p.id.split('-');
      if (parts.length >= 3 && parts[0] === prefix) {
        const n = parseInt(parts[1], 10);
        return Number.isFinite(n) && n > max ? n : max;
      }
      return max;
    }, 0);
    const nextNum = String(maxCorrelativo + 1).padStart(2, '0');
    const id = `${prefix}-${nextNum}-${year}`;

    const userData = await prisma.users.findUnique({
      where: { id: session.sub },
      select: { nombre: true, rol: true },
    });
    const rol = userData?.rol as Rol | undefined;
    const permsMap = await getRolePermissionsServer();
    if (!rol || !permsMap[rol]?.canCreate) {
      return NextResponse.json({ error: 'No tienes permiso para crear proyectos' }, { status: 403 });
    }

    const data = await prisma.proyectos.create({
      data: {
        id,
        cliente: body.cliente,
        fecha_creacion: new Date().toISOString().split('T')[0],
        monto: body.monto || 0,
        usuario_id: session.sub,
        usuario_nombre: userData?.nombre || 'Sistema',
        estado: 'EN INGENIERÍA', // el estado es automático; un proyecto nuevo arranca en Ingeniería
      },
    });

    const etapasDefault = [
      'Habilitación de material',
      'Área de Corte',
      'Área de Doblez',
      'Área de Soldadura',
      'Área de Pintura',
      'Área de Electricidad',
      'Área de Ensamblaje',
    ];

    // Sub-tablas y bitácora independientes entre sí → en paralelo
    await Promise.all([
      registrarActividad({
        proyectoId: id,
        cliente: body.cliente,
        usuario: userData?.nombre || 'Sistema',
        rol: rol || 'Sistema',
        accion: 'creacion',
        detalle: `creó la orden de proyecto para el cliente ${body.cliente}`,
      }),
      body.fecha_entrega || body.dias_plazo || body.adelanto
        ? prisma.proyecto_comercial.create({
            data: {
              proyecto_id: id,
              fecha_entrega: body.fecha_entrega || null,
              dias_plazo: body.dias_plazo || null,
              adelanto: body.adelanto || 0,
              metrado: body.metrado || '',
            },
          })
        : Promise.resolve(null),
      prisma.proyecto_etapas.createMany({
        data: etapasDefault.map((nombre, i) => ({ proyecto_id: id, nombre, orden: i + 1, estado: 'PENDIENTE' })),
      }),
      prisma.proyecto_ingenieria.create({ data: { proyecto_id: id, estado_planos: 'Solicitud de planos' } }),
      prisma.proyecto_produccion.create({ data: { proyecto_id: id, progreso: 0, pruebas: false, envio: false } }),
      prisma.proyecto_finanzas.create({ data: { proyecto_id: id, adelanto: body.adelanto || 0, porcentaje: 0 } }),
    ]);

    await notificar({
      proyectoId: id,
      tipo: 'hito',
      mensaje: `Nuevo proyecto ${id} (${body.cliente}) creado. Inicien los planos.`,
      rolesDestino: ['Ingeniería'],
      actorId: session.sub,
      actorNombre: userData?.nombre,
    });

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error('POST /api/proyectos error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
```

Nota: desaparece el filtro defensivo JS de `activo` (el schema fresco garantiza la columna) y el helper `one()` (Prisma tipa las relaciones 1-1 como objeto directamente).

- [ ] **Step 2: Verificar con curl** (login previo para cookie)

```bash
COOKIE="bbti_session=<token>"
curl -si http://localhost:3000/api/proyectos | head -1                       # 401 sin cookie
curl -s http://localhost:3000/api/proyectos -H "Cookie: $COOKIE"             # [] (BD nueva vacía)
curl -s -X POST http://localhost:3000/api/proyectos -H "Cookie: $COOKIE" -H "Content-Type: application/json" -d '{"cliente":"ACME Test","monto":1000}'
# Expected: 201 con id "PR-01-<año>"
curl -s http://localhost:3000/api/proyectos -H "Cookie: $COOKIE"
# Expected: 1 proyecto con comercial/produccion/confirmaciones y estado "EN INGENIERÍA"
```

- [ ] **Step 3: Commit**

```bash
git add app/api/proyectos/route.ts
git commit -m "refactor: /api/proyectos (lista y creación) a Prisma con guard de sesión"
```

---

### Task 10: /api/proyectos/[id] (GET/PATCH/DELETE) a Prisma

**Files:**
- Modify: `app/api/proyectos/[id]/route.ts` (reemplazo completo)

**Interfaces:**
- Consumes: igual que Task 9 + `computeReadiness`, `cascadeEtapas`, `permsForEtapa`, `FLOW_ETAPAS`, `mensajeConfirmacion`, `rolesParaConfirmacion`, `rolDelAreaDeEtapa`.
- Produces: misma forma del "full proyecto" de hoy: `{ ...proyecto, comercial: {..., comentarios[]}, ingenieria: {..., observaciones[]}, logistica: {materiales[]}, produccion: {..., etapas[]}, finanzas: {..., pagos[]}, documentos[], confirmaciones[], estado }`.
- **Seguridad nueva**: los objetos de secciones del body se filtran por whitelist de columnas (antes Postgrest rechazaba columnas desconocidas; Prisma lanzaría — el `pick` mantiene tolerancia).

- [ ] **Step 1: Reescribir `app/api/proyectos/[id]/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { getRolePermissionsServer } from '@/lib/auth/permissions-server';
import { registrarActividad } from '@/lib/utils/actividad';
import {
  aplicarRetraso,
  computeEstadoFromConfirmaciones,
  computeReadiness,
  cascadeEtapas,
  permsForEtapa,
  FLOW_ETAPAS,
  type EtapaFlujo,
} from '@/lib/utils/estado-proyecto';
import { notificar, rolesParaConfirmacion, mensajeConfirmacion, rolDelAreaDeEtapa } from '@/lib/notificaciones';
import type { Permissions, Rol } from '@/types';

// Toma solo las claves permitidas de un objeto del body (tolerancia a payloads
// con claves extra, como hacía PostgREST; Prisma lanzaría ante columnas desconocidas).
const pick = (obj: Record<string, unknown>, keys: string[]): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
};

const COMERCIAL_KEYS = ['fecha_entrega', 'dias_plazo', 'adelanto', 'adelanto_fijado', 'metrado', 'alerta'];
const INGENIERIA_KEYS = ['estado_planos'];
const PRODUCCION_KEYS = ['progreso', 'pruebas', 'envio'];
const FINANZAS_KEYS = ['adelanto', 'fecha_adelanto', 'porcentaje', 'forma_pago', 'alerta'];

// Proyecto completo (todas las áreas) en un solo query con relaciones.
async function buildFullProyecto(id: string) {
  const p = await prisma.proyectos.findUnique({
    where: { id },
    include: {
      comercial: true,
      ingenieria: true,
      materiales: { orderBy: { id: 'asc' } },
      produccion: true,
      etapas: { orderBy: { orden: 'asc' } },
      finanzas: true,
      pagos: { orderBy: { fecha: 'asc' } },
      comentarios: { orderBy: { fecha: 'desc' } },
      observaciones: { orderBy: { fecha: 'desc' } },
      documentos: { orderBy: { created_at: 'desc' } },
      confirmaciones: true,
    },
  });
  if (!p) return null;

  const { comercial, ingenieria, materiales, produccion, etapas, finanzas, pagos, comentarios, observaciones, documentos, confirmaciones, ...proyecto } = p;

  const fullProyecto = {
    ...proyecto,
    comercial: comercial ? { ...comercial, comentarios } : null,
    ingenieria: ingenieria ? { ...ingenieria, observaciones } : null,
    logistica: { materiales },
    produccion: produccion ? { ...produccion, etapas } : null,
    finanzas: finanzas ? { ...finanzas, pagos } : null,
    documentos,
    confirmaciones,
    estado: proyecto.estado,
  };

  const hoy = new Date().toISOString().split('T')[0];
  const confirmadas = new Set(confirmaciones.map((c) => c.etapa as EtapaFlujo));
  const estadoBase = computeEstadoFromConfirmaciones(confirmadas);
  fullProyecto.estado = aplicarRetraso(estadoBase, comercial?.fecha_entrega, hoy);
  return fullProyecto;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const { id } = await params;
    const full = await buildFullProyecto(id);
    if (!full) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
    return NextResponse.json(full);
  } catch (err) {
    console.error('GET /api/proyectos/[id] error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const body = await request.json();

    const userData = await prisma.users.findUnique({
      where: { id: session.sub },
      select: { nombre: true, rol: true },
    });
    const rol = userData?.rol as Rol | undefined;
    const permsMap = await getRolePermissionsServer();
    const can = (perm: keyof Permissions): boolean =>
      rol ? permsMap[rol]?.[perm] ?? false : false;
    const autor = userData?.nombre || 'Sistema';
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();

    // Restaurar de la papelera
    if (body.restaurar === true) {
      if (!can('canDelete')) {
        return NextResponse.json({ error: 'Sin permiso para restaurar proyectos' }, { status: 403 });
      }
      await prisma.proyectos.update({ where: { id }, data: { activo: true } });
      const full = await buildFullProyecto(id);
      if (full) {
        await registrarActividad({
          proyectoId: id,
          cliente: full.cliente,
          usuario: autor,
          rol: rol || 'Sistema',
          accion: 'restaurar',
          detalle: `restauró la orden de proyecto de la papelera`,
        });
      }
      return NextResponse.json(full ?? { success: true });
    }

    // Permiso por sección enviada
    const requiere: Array<[boolean, keyof Permissions]> = [
      [body.cliente !== undefined || body.monto !== undefined || body.estado !== undefined, 'canEdit'],
      [body.comercial !== undefined || body.addComentario !== undefined, 'canEditComercial'],
      [body.ingenieria !== undefined || body.addObservacion !== undefined || body.updateDocumento !== undefined, 'canEditIngenieria'],
      [body.produccion !== undefined || body.etapas !== undefined, 'canEditProduccion'],
      [body.finanzas !== undefined || body.addPago !== undefined, 'canEditFinance'],
    ];
    for (const [enviado, perm] of requiere) {
      if (enviado && !can(perm)) {
        return NextResponse.json(
          { error: `Sin permiso para modificar esta sección (${perm})` },
          { status: 403 }
        );
      }
    }

    // Materiales: Logística o Comercial (import de metrado)
    if (body.materiales !== undefined && !can('canEditLogistica') && !can('canEditComercial')) {
      return NextResponse.json({ error: 'Sin permiso para modificar materiales' }, { status: 403 });
    }

    // Confirmar etapa (sign-off)
    if (body.confirmarEtapa?.etapa) {
      const etapa = body.confirmarEtapa.etapa as EtapaFlujo;
      if (!FLOW_ETAPAS.includes(etapa)) {
        return NextResponse.json({ error: 'Etapa inválida' }, { status: 400 });
      }
      if (!permsForEtapa(etapa).some((p) => can(p))) {
        return NextResponse.json({ error: `Sin permiso para firmar ${etapa}` }, { status: 403 });
      }
      // Revalidar readiness desde BD (incluye pago 100% para "completado")
      const [docs, mats, etps, confs, currentProy, com, pagos] = await Promise.all([
        prisma.proyecto_documentos.findMany({ where: { proyecto_id: id }, select: { estado: true } }),
        prisma.proyecto_materiales.findMany({ where: { proyecto_id: id }, select: { estado: true } }),
        prisma.proyecto_etapas.findMany({ where: { proyecto_id: id }, select: { estado: true } }),
        prisma.proyecto_confirmaciones.findMany({ where: { proyecto_id: id }, select: { etapa: true } }),
        prisma.proyectos.findUnique({ where: { id }, select: { cliente: true, monto: true } }),
        prisma.proyecto_comercial.findUnique({ where: { proyecto_id: id }, select: { adelanto: true } }),
        prisma.proyecto_pagos.findMany({ where: { proyecto_id: id }, select: { monto: true } }),
      ]);
      const ready = computeReadiness({
        confirmaciones: confs,
        documentos: docs,
        materiales: mats,
        etapas: etps,
        monto: currentProy?.monto,
        adelanto: com?.adelanto,
        pagos,
      });
      if (!ready[etapa]) {
        return NextResponse.json(
          { error: 'La etapa no está lista para confirmar', code: 'NOT_READY' },
          { status: 409 }
        );
      }
      await prisma.proyecto_confirmaciones.upsert({
        where: { proyecto_id_etapa: { proyecto_id: id, etapa } },
        update: { confirmada_por: autor, confirmada_at: now },
        create: { proyecto_id: id, etapa, confirmada_por: autor, confirmada_at: now },
      });
      await registrarActividad({
        proyectoId: id,
        cliente: currentProy?.cliente,
        usuario: autor,
        rol: rol || 'Sistema',
        accion: 'firma',
        detalle: `firmó y aprobó la etapa de ${etapa}`,
      });
      await notificar({
        proyectoId: id,
        tipo: 'confirmacion',
        mensaje: mensajeConfirmacion(etapa, id),
        rolesDestino: rolesParaConfirmacion(etapa),
        actorId: session.sub,
        actorNombre: autor,
      });
    }

    // Deshacer etapa (cascada)
    if (body.deshacerEtapa?.etapa) {
      const etapa = body.deshacerEtapa.etapa as EtapaFlujo;
      if (!FLOW_ETAPAS.includes(etapa)) {
        return NextResponse.json({ error: 'Etapa inválida' }, { status: 400 });
      }
      if (!permsForEtapa(etapa).some((p) => can(p))) {
        return NextResponse.json({ error: `Sin permiso para deshacer ${etapa}` }, { status: 403 });
      }
      const currentProy = await prisma.proyectos.findUnique({ where: { id }, select: { cliente: true } });

      await prisma.proyecto_confirmaciones.deleteMany({
        where: { proyecto_id: id, etapa: { in: cascadeEtapas(etapa) } },
      });

      await registrarActividad({
        proyectoId: id,
        cliente: currentProy?.cliente,
        usuario: autor,
        rol: rol || 'Sistema',
        accion: 'deshacer',
        detalle: `revirtió la firma de la etapa de ${etapa}`,
      });

      await notificar({
        proyectoId: id,
        tipo: 'confirmacion',
        mensaje: `Se revirtió la etapa "${etapa}" de ${id}.`,
        rolesDestino: [rolDelAreaDeEtapa(etapa)],
        actorId: session.sub,
        actorNombre: autor,
      });
    }

    // Campos principales
    if (body.cliente !== undefined || body.monto !== undefined || body.estado !== undefined) {
      const updates: Record<string, unknown> = { updated_at: now };
      if (body.cliente !== undefined) updates.cliente = body.cliente;
      if (body.monto !== undefined) updates.monto = body.monto;
      if (body.estado !== undefined) updates.estado = body.estado;
      await prisma.proyectos.update({
        where: { id },
        data: updates as Prisma.proyectosUncheckedUpdateInput,
      });
    }

    // Secciones escalares (upsert con whitelist de columnas).
    // El cast Unchecked*Input es necesario: `pick` devuelve Record<string, unknown>
    // y el whitelist ya garantiza que solo pasan columnas válidas.
    if (body.comercial) {
      const data = pick(body.comercial, COMERCIAL_KEYS);
      await prisma.proyecto_comercial.upsert({
        where: { proyecto_id: id },
        update: { ...data, updated_at: now } as Prisma.proyecto_comercialUncheckedUpdateInput,
        create: { proyecto_id: id, ...data } as Prisma.proyecto_comercialUncheckedCreateInput,
      });
    }
    if (body.ingenieria) {
      const data = pick(body.ingenieria, INGENIERIA_KEYS);
      await prisma.proyecto_ingenieria.upsert({
        where: { proyecto_id: id },
        update: { ...data, updated_at: now } as Prisma.proyecto_ingenieriaUncheckedUpdateInput,
        create: { proyecto_id: id, ...data } as Prisma.proyecto_ingenieriaUncheckedCreateInput,
      });
    }
    if (body.produccion) {
      const data = pick(body.produccion, PRODUCCION_KEYS);
      await prisma.proyecto_produccion.upsert({
        where: { proyecto_id: id },
        update: { ...data, updated_at: now } as Prisma.proyecto_produccionUncheckedUpdateInput,
        create: { proyecto_id: id, ...data } as Prisma.proyecto_produccionUncheckedCreateInput,
      });
    }
    if (body.finanzas) {
      const data = pick(body.finanzas, FINANZAS_KEYS);
      await prisma.proyecto_finanzas.upsert({
        where: { proyecto_id: id },
        update: { ...data, updated_at: now } as Prisma.proyecto_finanzasUncheckedUpdateInput,
        create: { proyecto_id: id, ...data } as Prisma.proyecto_finanzasUncheckedCreateInput,
      });
    }

    // Materiales — reemplazo total del set
    if (Array.isArray(body.materiales)) {
      await prisma.proyecto_materiales.deleteMany({ where: { proyecto_id: id } });
      if (body.materiales.length > 0) {
        await prisma.proyecto_materiales.createMany({
          data: body.materiales.map((m: Record<string, unknown>) => ({
            proyecto_id: id,
            nombre: String(m.nombre ?? ''),
            cantidad: Number(m.cantidad ?? 0),
            unidad: String(m.unidad ?? 'und'),
            comprado: Number(m.comprado ?? 0),
            estado: String(m.estado ?? 'PENDIENTE'),
            codigo: m.codigo != null ? String(m.codigo) : null,
            precio_unitario: Number(m.precio_unitario ?? 0),
          })),
        });
      }

      const currentProy = await prisma.proyectos.findUnique({ where: { id }, select: { cliente: true } });
      if (body.comercial?.metrado) {
        const totalParsed = body.materiales.reduce(
          (acc: number, m: { cantidad: number; precio_unitario?: number }) =>
            acc + m.cantidad * (m.precio_unitario || 0),
          0
        );
        await registrarActividad({
          proyectoId: id,
          cliente: currentProy?.cliente,
          usuario: autor,
          rol: rol || 'Sistema',
          accion: 'metrado',
          detalle: `importó metrado de Excel (${body.materiales.length} materiales) por un total de S/ ${totalParsed.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
        });
      } else {
        await registrarActividad({
          proyectoId: id,
          cliente: currentProy?.cliente,
          usuario: autor,
          rol: rol || 'Sistema',
          accion: 'compras',
          detalle: `actualizó el estado de compra de materiales`,
        });
      }
    }

    // Metrado importado → avisa a Logística (por flag, no por rol del actor)
    if (Array.isArray(body.materiales) && body.comercial?.metrado) {
      await notificar({
        proyectoId: id,
        tipo: 'datos',
        mensaje: `${autor} importó el metrado de ${id}. Revisen las compras.`,
        rolesDestino: ['Logística'],
        actorId: session.sub,
        actorNombre: autor,
      });
    }

    // Estado de un documento (versión de plano)
    if (body.updateDocumento?.id) {
      await prisma.proyecto_documentos.updateMany({
        where: { id: body.updateDocumento.id, proyecto_id: id },
        data: { estado: body.updateDocumento.estado ?? null },
      });

      const docInfo = await prisma.proyecto_documentos.findUnique({
        where: { id: body.updateDocumento.id },
        select: { nombre: true },
      });
      const currentProy = await prisma.proyectos.findUnique({ where: { id }, select: { cliente: true } });

      await registrarActividad({
        proyectoId: id,
        cliente: currentProy?.cliente,
        usuario: autor,
        rol: rol || 'Sistema',
        accion: 'documento',
        detalle: `actualizó el estado del plano "${docInfo?.nombre || 'plano'}" a "${body.updateDocumento.estado || 'sin estado'}"`,
      });

      if (typeof body.updateDocumento.estado === 'string' && /enviad/i.test(body.updateDocumento.estado)) {
        await notificar({
          proyectoId: id,
          tipo: 'documento',
          mensaje: `Ingeniería envió un plano de ${id} para revisión.`,
          rolesDestino: ['Comercial'],
          actorId: session.sub,
          actorNombre: autor,
        });
      }
    }

    // Etapas — actualización puntual por id
    if (Array.isArray(body.etapas)) {
      await Promise.all(
        body.etapas.map((e: { id: string; estado: string }) =>
          prisma.proyecto_etapas.updateMany({
            where: { id: e.id, proyecto_id: id },
            data: { estado: e.estado },
          })
        )
      );

      const currentProy = await prisma.proyectos.findUnique({ where: { id }, select: { cliente: true } });
      await registrarActividad({
        proyectoId: id,
        cliente: currentProy?.cliente,
        usuario: autor,
        rol: rol || 'Sistema',
        accion: 'produccion',
        detalle: `actualizó el estado de las etapas de fabricación de producción`,
      });
    }

    // Comentario (Comercial)
    if (body.addComentario?.texto) {
      await prisma.proyecto_comentarios.create({
        data: { proyecto_id: id, autor, texto: body.addComentario.texto, fecha: today },
      });
      const currentProy = await prisma.proyectos.findUnique({ where: { id }, select: { cliente: true } });
      await registrarActividad({
        proyectoId: id,
        cliente: currentProy?.cliente,
        usuario: autor,
        rol: rol || 'Sistema',
        accion: 'comentario',
        detalle: `agregó un comentario comercial: "${body.addComentario.texto.slice(0, 60)}${body.addComentario.texto.length > 60 ? '...' : ''}"`,
      });
    }

    // Observación (Ingeniería)
    if (body.addObservacion?.texto) {
      await prisma.proyecto_observaciones.create({
        data: { proyecto_id: id, autor, texto: body.addObservacion.texto, fecha: today },
      });
      const currentProy = await prisma.proyectos.findUnique({ where: { id }, select: { cliente: true } });
      await registrarActividad({
        proyectoId: id,
        cliente: currentProy?.cliente,
        usuario: autor,
        rol: rol || 'Sistema',
        accion: 'observacion',
        detalle: `agregó una observación de ingeniería: "${body.addObservacion.texto.slice(0, 60)}${body.addObservacion.texto.length > 60 ? '...' : ''}"`,
      });
    }

    // Pago adicional (Finanzas)
    if (body.addPago?.monto !== undefined) {
      await prisma.proyecto_pagos.create({
        data: {
          proyecto_id: id,
          descripcion: body.addPago.descripcion ?? '',
          monto: body.addPago.monto,
          fecha: body.addPago.fecha ?? today,
        },
      });
      const currentProy = await prisma.proyectos.findUnique({ where: { id }, select: { cliente: true } });
      await registrarActividad({
        proyectoId: id,
        cliente: currentProy?.cliente,
        usuario: autor,
        rol: rol || 'Sistema',
        accion: 'pago',
        detalle: `registró un pago adicional de S/ ${body.addPago.monto.toLocaleString('en-US', { minimumFractionDigits: 2 })} (${body.addPago.descripcion || 'sin descripción'})`,
      });
    }

    // El estado SIEMPRE se re-deriva de las firmas
    const confsAll = await prisma.proyecto_confirmaciones.findMany({
      where: { proyecto_id: id },
      select: { etapa: true },
    });
    const confirmadasAll = new Set(confsAll.map((c) => c.etapa as EtapaFlujo));
    const nuevoEstado = computeEstadoFromConfirmaciones(confirmadasAll);
    await prisma.proyectos.update({ where: { id }, data: { estado: nuevoEstado, updated_at: now } });

    const full = await buildFullProyecto(id);
    return NextResponse.json(full ?? { success: true, estado: nuevoEstado });
  } catch (err) {
    console.error('PATCH /api/proyectos/[id] error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const userData = await prisma.users.findUnique({
      where: { id: session.sub },
      select: { nombre: true, rol: true },
    });
    const rol = userData?.rol as Rol | undefined;
    const permsMap = await getRolePermissionsServer();
    if (!rol || !permsMap[rol]?.canDelete) {
      return NextResponse.json({ error: 'Sin permiso para eliminar proyectos' }, { status: 403 });
    }

    const proy = await prisma.proyectos.findUnique({ where: { id }, select: { cliente: true } });
    if (!proy) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });

    // Borrado suave (papelera)
    await prisma.proyectos.update({ where: { id }, data: { activo: false } });

    await registrarActividad({
      proyectoId: id,
      cliente: proy.cliente,
      usuario: userData?.nombre || 'Sistema',
      rol: rol || 'Sistema',
      accion: 'eliminacion',
      detalle: `envió la orden de proyecto a la papelera`,
    });

    await notificar({
      proyectoId: id,
      tipo: 'hito',
      mensaje: `${userData?.nombre ?? 'Alguien'} (${rol}) eliminó la PR ${id}${proy.cliente ? ` — ${proy.cliente}` : ''}.`,
      rolesDestino: ['Administrador', 'Gerencia General'],
      actorId: session.sub,
      actorNombre: userData?.nombre,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/proyectos/[id] error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verificar** — con el proyecto de la Task 9:

```bash
curl -s http://localhost:3000/api/proyectos/PR-01-2026 -H "Cookie: $COOKIE" | head -c 400
# Expected: full proyecto con comercial/ingenieria/logistica/produccion/finanzas/documentos/confirmaciones
curl -s -X PATCH http://localhost:3000/api/proyectos/PR-01-2026 -H "Cookie: $COOKIE" -H "Content-Type: application/json" -d '{"addComentario":{"texto":"prueba prisma"}}'
# Expected: full proyecto con el comentario dentro de comercial.comentarios
curl -si -X DELETE http://localhost:3000/api/proyectos/PR-01-2026 -H "Cookie: $COOKIE" | head -1
# Expected: 200; y GET /api/proyectos ya no lo lista (papelera)
curl -s -X PATCH http://localhost:3000/api/proyectos/PR-01-2026 -H "Cookie: $COOKIE" -H "Content-Type: application/json" -d '{"restaurar":true}' | head -c 120
# Expected: full proyecto restaurado
```

- [ ] **Step 3: Commit**

```bash
git add "app/api/proyectos/[id]/route.ts"
git commit -m "refactor: detalle/PATCH/DELETE de proyectos a Prisma (firmas, readiness, papelera)"
```

---

### Task 11: Notificaciones sin Realtime (API + hook polling + feed del dashboard)

**Files:**
- Modify: `app/api/notificaciones/route.ts`, `app/api/notificaciones/marcar-leidas/route.ts`, `hooks/useNotificaciones.ts`, `app/(dashboard)/page.tsx`

**Interfaces:**
- El hook conserva EXACTAMENTE su API: `{ list, unreadCount, markAllRead, markRead }` — `NotificacionesBell` no se toca.

- [ ] **Step 1: `app/api/notificaciones/route.ts`** (reemplazo completo)

```ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const [items, count] = await Promise.all([
      prisma.notificaciones.findMany({
        where: { destinatario_id: session.sub },
        orderBy: { created_at: 'desc' },
        take: 20,
      }),
      prisma.notificaciones.count({
        where: { destinatario_id: session.sub, leida: false },
      }),
    ]);

    return NextResponse.json({ items, unreadCount: count });
  } catch (err) {
    console.error('GET /api/notificaciones error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
```

- [ ] **Step 2: `app/api/notificaciones/marcar-leidas/route.ts`** (reemplazo completo)

```ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const ids: unknown = body?.ids;

    await prisma.notificaciones.updateMany({
      where: {
        destinatario_id: session.sub,
        ...(Array.isArray(ids) && ids.length > 0 ? { id: { in: ids as string[] } } : {}),
      },
      data: { leida: true },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST /api/notificaciones/marcar-leidas error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
```

- [ ] **Step 3: `hooks/useNotificaciones.ts`** (reemplazo completo — polling 20s, sin supabase)

```ts
'use client';

import { useEffect, useState, useCallback } from 'react';
import type { Notificacion } from '@/types';

const POLL_MS = 20_000;

// Realtime de Supabase → polling: mismo contrato del hook, así
// NotificacionesBell no cambia. El aumento de unreadCount entre polls
// dispara el mismo efecto visual/sonoro que antes disparaba el INSERT.
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
    // El setState ocurre tras await (deferido); falso positivo de set-state-in-effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
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

- [ ] **Step 4: `app/(dashboard)/page.tsx`** — quitar el canal Realtime y mover chime/destello al diff del polling:

1. Eliminar `import { createClient } from '@/lib/supabase/client';` (línea 32) y agregar `useRef` al import de React.
2. Declarar junto a los otros estados del componente un ref con los IDs del último poll (fuente del diff — NO usar el estado `actividades` dentro del interval, quedaría stale en el closure):

```tsx
  // IDs de actividad del último poll; null = aún no hubo carga inicial.
  const prevActIdsRef = useRef<Set<string> | null>(null);
```

3. En `fetchDashboardData`, reemplazar el bloque `if (actRes.ok) {...}` por una versión que detecta filas nuevas (el chime/destello queda FUERA del updater de React — un side effect dentro de `setState(prev => ...)` sonaría doble en Strict Mode):

```tsx
      if (actRes.ok) {
        const actData: ActividadLog[] = await actRes.json();
        const prevIds = prevActIdsRef.current;
        // Diff del polling: en la carga inicial (ref null) no hay chime ni destello.
        if (prevIds) {
          const nuevos = actData.filter((a) => !prevIds.has(a.id));
          if (nuevos.length > 0) {
            playChime();
            setNewlyAddedIds((prev) => {
              const next = new Set(prev);
              nuevos.forEach((n) => next.add(n.id));
              return next;
            });
            setTimeout(() => {
              setNewlyAddedIds((prev) => {
                const next = new Set(prev);
                nuevos.forEach((n) => next.delete(n.id));
                return next;
              });
            }, 4000);
          }
        }
        prevActIdsRef.current = new Set(actData.map((a) => a.id));
        setActividades(actData);
      }
```

4. Reemplazar el `useEffect` completo (líneas 113–174) por:

```tsx
  useEffect(() => {
    // El setState corre tras await; falso positivo de set-state-in-effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchDashboardData();

    // Sin Realtime: el polling es el único mecanismo de refresco.
    // El diff dentro de fetchDashboardData repone el chime + destello.
    const timer = setInterval(() => {
      fetchDashboardData(true);
    }, 10000);

    return () => clearInterval(timer);
  }, []);
```

- [ ] **Step 5: Verificar** — dashboard abierto en el navegador; en otra pestaña crear un proyecto → en ≤10s el feed muestra la fila con destello + chime; la campanita del Topbar sube su contador en ≤20s para el usuario destinatario.

- [ ] **Step 6: Commit**

```bash
git add app/api/notificaciones/ hooks/useNotificaciones.ts "app/(dashboard)/page.tsx"
git commit -m "refactor: notificaciones y feed de actividad a polling (sin Supabase Realtime)"
```

---

### Task 12: /api/usuarios con password_hash

**Files:**
- Modify: `app/api/usuarios/route.ts`, `app/api/usuarios/[id]/route.ts` (reemplazos completos)

**Interfaces:**
- POST crea el usuario con `password_hash` (bcryptjs, 10 rounds) — ya no existe Admin API de Supabase. PATCH acepta opcionalmente `password` (re-hash). Respuestas nunca incluyen el hash.

- [ ] **Step 1: `app/api/usuarios/route.ts`**

```ts
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { usuarioSchema } from '@/lib/validations/usuario.schema';

const SAFE_FIELDS = { id: true, nombre: true, email: true, area: true, rol: true, activo: true, created_at: true } as const;

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const data = await prisma.users.findMany({
      select: SAFE_FIELDS,
      orderBy: { created_at: 'asc' },
    });
    return NextResponse.json(data);
  } catch (err) {
    console.error('GET /api/usuarios error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const solicitante = await prisma.users.findUnique({ where: { id: session.sub }, select: { rol: true } });
    if (solicitante?.rol !== 'Administrador') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = usuarioSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { nombre, email, area, rol, password } = parsed.data;

    const password_hash = await bcrypt.hash(password, 10);
    try {
      const data = await prisma.users.create({
        data: { nombre, email: email.toLowerCase(), area, rol, activo: true, password_hash },
        select: { id: true, nombre: true, email: true, area: true, rol: true, activo: true },
      });
      return NextResponse.json(data, { status: 201 });
    } catch (e: unknown) {
      // P2002 = unique violation (email duplicado)
      if (typeof e === 'object' && e !== null && 'code' in e && (e as { code: string }).code === 'P2002') {
        return NextResponse.json({ error: 'Ya existe un usuario con ese email' }, { status: 400 });
      }
      throw e;
    }
  } catch (err) {
    console.error('POST /api/usuarios error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
```

- [ ] **Step 2: `app/api/usuarios/[id]/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { roles } from '@/lib/validations/usuario.schema';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const solicitante = await prisma.users.findUnique({ where: { id: session.sub }, select: { rol: true } });
    if (solicitante?.rol !== 'Administrador') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    const body = await request.json();
    const updates: Record<string, unknown> = {};
    if (typeof body.activo === 'boolean') updates.activo = body.activo;
    if (typeof body.nombre === 'string') updates.nombre = body.nombre;
    if (typeof body.area === 'string') updates.area = body.area;
    if (typeof body.rol === 'string') {
      if (!roles.includes(body.rol)) {
        return NextResponse.json({ error: 'Rol inválido' }, { status: 400 });
      }
      updates.rol = body.rol;
    }
    // Cambio de contraseña opcional (antes lo hacía el Admin API de Supabase)
    if (typeof body.password === 'string' && body.password.length > 0) {
      if (body.password.length < 6) {
        return NextResponse.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, { status: 400 });
      }
      updates.password_hash = await bcrypt.hash(body.password, 10);
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 });
    }

    const data = await prisma.users.update({
      where: { id },
      // updates se arma campo a campo validado arriba; el cast evita el choque
      // Record<string, unknown> vs input tipado de Prisma.
      data: updates as Prisma.usersUncheckedUpdateInput,
      select: { id: true, nombre: true, email: true, area: true, rol: true, activo: true },
    });
    return NextResponse.json(data);
  } catch (err) {
    console.error('PATCH /api/usuarios/[id] error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Verificar** — como Admin: crear usuario nuevo desde la página Usuarios; loguearse con él; PATCH `{"password":"nueva123"}` y reloguear con la nueva. Verificar que `GET /api/usuarios` NO devuelve `password_hash`.

- [ ] **Step 4: Commit**

```bash
git add app/api/usuarios/
git commit -m "refactor: gestión de usuarios a Prisma con password_hash propio (sin Admin API)"
```

---

### Task 13: Rutas restantes de datos a Prisma (actividad, productividad, permisos, configuración, cron)

**Files:**
- Modify: `app/api/actividad/route.ts`, `app/api/productividad/route.ts`, `app/api/role-permissions/route.ts`, `app/api/configuracion/route.ts`, `app/api/configuracion/backup/route.ts`, `app/api/configuracion/restore/route.ts`, `app/api/cron/alertas-vencimiento/route.ts`

**Interfaces:** mismas respuestas JSON actuales. `getRolePermissionsServer()` ya sin argumento.

- [ ] **Step 1: `app/api/actividad/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const data = await prisma.actividad_log.findMany({
      orderBy: { created_at: 'desc' },
      take: 50,
    });
    return NextResponse.json(data);
  } catch (err) {
    console.error('GET /api/actividad error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
```

- [ ] **Step 2: `app/api/productividad/route.ts`** — conservar TODA la lógica de agregación (interfaz `FilaUsuario`, `HITO_ACCIONES`, fechas Lima). Solo cambian el auth y las dos consultas:

```ts
// Reemplazar imports de supabase por:
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { getRolePermissionsServer } from '@/lib/auth/permissions-server';

// Dentro de GET, reemplazar la sección de auth/consultas por:
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const me = await prisma.users.findUnique({ where: { id: session.sub }, select: { rol: true } });
    const perms = await getRolePermissionsServer();
    const rolActual = me?.rol as Rol | undefined;
    if (!rolActual || !perms[rolActual]?.canViewReports) {
      return NextResponse.json({ error: 'Acceso restringido' }, { status: 403 });
    }

    // (cálculo de hoyLima/hasta/desde IGUAL que hoy)

    const usuarios = await prisma.users.findMany({
      select: { nombre: true, rol: true, activo: true },
      orderBy: { nombre: 'asc' },
    });

    const eventos = await prisma.actividad_log.findMany({
      where: {
        created_at: {
          gte: new Date(`${desde}T00:00:00-05:00`),
          lte: new Date(`${hasta}T23:59:59-05:00`),
        },
      },
      select: { usuario: true, rol: true, accion: true, proyecto_id: true, created_at: true },
      orderBy: { created_at: 'desc' },
    });
```

OJO: `e.created_at` ahora es `Date` (antes string). En la acumulación cambiar `fila.ultimaActividad = e.created_at` por `fila.ultimaActividad = e.created_at.toISOString()`. El resto de la función queda idéntico.

- [ ] **Step 3: `app/api/role-permissions/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { PERMS } from '@/lib/auth/permissions';
import type { Rol, Permissions } from '@/types';

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const data = await prisma.role_permissions.findMany({ select: { rol: true, permissions: true } });

    const map = {} as Record<Rol, Permissions>;
    for (const r of data) {
      map[r.rol as Rol] = r.permissions as unknown as Permissions;
    }
    for (const r of Object.keys(PERMS) as Rol[]) {
      if (!map[r]) map[r] = PERMS[r];
    }
    return NextResponse.json(map);
  } catch (err) {
    console.error('GET /api/role-permissions error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const userData = await prisma.users.findUnique({ where: { id: session.sub }, select: { rol: true } });
    if (!userData || userData.rol !== 'Administrador') {
      return NextResponse.json({ error: 'Acceso denegado. Solo el Administrador puede editar roles.' }, { status: 403 });
    }

    const { rol, permissions } = await request.json();
    if (!rol || !permissions) {
      return NextResponse.json({ error: 'rol y permissions requeridos' }, { status: 400 });
    }

    await prisma.role_permissions.upsert({
      where: { rol },
      update: { permissions, updated_at: new Date() },
      create: { rol, permissions },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('PATCH /api/role-permissions error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
```

- [ ] **Step 4: `app/api/configuracion/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const data = await prisma.company_config.findFirst();
    return NextResponse.json(data ?? {});
  } catch (err) {
    console.error('GET /api/configuracion error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const solicitante = await prisma.users.findUnique({ where: { id: session.sub }, select: { rol: true } });
    if (solicitante?.rol !== 'Administrador') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    const body = await request.json();
    const fields = ['name', 'siglas', 'rubro', 'ruc', 'direccion', 'telefono', 'email', 'website', 'moneda', 'igv', 'orden_prefix', 'dias_alerta'];
    const updates: Record<string, unknown> = { updated_at: new Date() };
    for (const f of fields) {
      if (body[f] !== undefined) updates[f] = body[f];
    }

    const existing = await prisma.company_config.findFirst({ select: { id: true } });
    // updates se arma con whitelist de campos; cast por el Record<string, unknown>
    const data = existing
      ? await prisma.company_config.update({
          where: { id: existing.id },
          data: updates as Prisma.company_configUncheckedUpdateInput,
        })
      : await prisma.company_config.create({
          data: updates as Prisma.company_configUncheckedCreateInput,
        });

    return NextResponse.json(data);
  } catch (err) {
    console.error('PATCH /api/configuracion error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
```

- [ ] **Step 5: `app/api/configuracion/backup/route.ts`** — mismo gate Admin (vía `getSession` + rol); reemplazar las lecturas:

```ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const solicitante = await prisma.users.findUnique({ where: { id: session.sub }, select: { rol: true, email: true } });
    if (solicitante?.rol !== 'Administrador') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    // NOTA: users incluye password_hash a propósito — sin él, un restore
    // dejaría a todos sin poder loguearse. El backup es solo-Admin.
    const [company_config, users, proyectos, role_permissions, proyecto_comercial, proyecto_ingenieria, proyecto_materiales, proyecto_produccion, proyecto_etapas, proyecto_finanzas, proyecto_pagos, proyecto_comentarios, proyecto_observaciones, proyecto_documentos, proyecto_confirmaciones, alertas] = await Promise.all([
      prisma.company_config.findMany(),
      prisma.users.findMany(),
      prisma.proyectos.findMany(),
      prisma.role_permissions.findMany(),
      prisma.proyecto_comercial.findMany(),
      prisma.proyecto_ingenieria.findMany(),
      prisma.proyecto_materiales.findMany(),
      prisma.proyecto_produccion.findMany(),
      prisma.proyecto_etapas.findMany(),
      prisma.proyecto_finanzas.findMany(),
      prisma.proyecto_pagos.findMany(),
      prisma.proyecto_comentarios.findMany(),
      prisma.proyecto_observaciones.findMany(),
      prisma.proyecto_documentos.findMany(),
      prisma.proyecto_confirmaciones.findMany(),
      prisma.alertas.findMany(),
    ]);

    return NextResponse.json({
      version: '1.0',
      exportedAt: new Date().toISOString(),
      exportedBy: solicitante.email,
      data: { company_config, users, proyectos, role_permissions, proyecto_comercial, proyecto_ingenieria, proyecto_materiales, proyecto_produccion, proyecto_etapas, proyecto_finanzas, proyecto_pagos, proyecto_comentarios, proyecto_observaciones, proyecto_documentos, proyecto_confirmaciones, alertas },
    });
  } catch (err: unknown) {
    console.error('GET /api/configuracion/backup error:', err);
    const message = err instanceof Error ? err.message : 'Error interno del servidor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 6: `app/api/configuracion/restore/route.ts`** — misma lógica secuencial de hoy, con Prisma:

```ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const solicitante = await prisma.users.findUnique({ where: { id: session.sub }, select: { rol: true } });
    if (solicitante?.rol !== 'Administrador') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    const { version, data } = await request.json();
    if (!version || !data) {
      return NextResponse.json({ error: 'Formato de backup inválido o vacío' }, { status: 400 });
    }

    // 1. Configuración de empresa
    if (Array.isArray(data.company_config) && data.company_config.length > 0) {
      await prisma.company_config.deleteMany({});
      await prisma.company_config.createMany({ data: data.company_config });
    }

    // 2. Permisos por rol
    if (Array.isArray(data.role_permissions) && data.role_permissions.length > 0) {
      for (const rp of data.role_permissions) {
        await prisma.role_permissions.upsert({
          where: { rol: rp.rol },
          update: { permissions: rp.permissions, updated_at: rp.updated_at ?? new Date() },
          create: rp,
        });
      }
    }

    // 3. Usuarios (upsert por id para conservar referencias)
    if (Array.isArray(data.users) && data.users.length > 0) {
      for (const u of data.users) {
        await prisma.users.upsert({ where: { id: u.id }, update: u, create: u });
      }
    }

    // 4. Limpiar proyectos (las subtablas caen en cascada por FK)
    await prisma.proyectos.deleteMany({});

    // 5. Proyectos base
    if (Array.isArray(data.proyectos) && data.proyectos.length > 0) {
      await prisma.proyectos.createMany({ data: data.proyectos });
    }

    // 6. Subtablas en orden
    const subtables = [
      'proyecto_comercial', 'proyecto_ingenieria', 'proyecto_produccion', 'proyecto_finanzas',
      'proyecto_materiales', 'proyecto_etapas', 'proyecto_pagos', 'proyecto_comentarios',
      'proyecto_observaciones', 'proyecto_documentos', 'proyecto_confirmaciones', 'alertas',
    ] as const;
    for (const table of subtables) {
      const list = data[table];
      if (Array.isArray(list) && list.length > 0) {
        // acceso dinámico al modelo homónimo del cliente Prisma
        await (prisma[table] as { createMany: (args: { data: unknown[] }) => Promise<unknown> }).createMany({ data: list });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error('POST /api/configuracion/restore error:', err);
    const message = err instanceof Error ? err.message : 'Error durante la restauración';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

NOTA: los backups exportados en la era Supabase no traen `password_hash` en `users` → un restore de un backup viejo fallaría por columna requerida. Aceptado: los backups previos al corte no son restaurables (BD fresca, sin datos que preservar).

- [ ] **Step 7: `app/api/cron/alertas-vencimiento/route.ts`** — misma lógica (dedup edge-triggered + housekeeping), consultas a Prisma:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  computeEstadoFromConfirmaciones,
  FLOW_ETAPAS,
  ETAPA_LABEL,
  type EtapaFlujo,
} from '@/lib/utils/estado-proyecto';
import { rolDelAreaDeEtapa, notificar } from '@/lib/notificaciones';
import { clasificarVencimiento, mensajeVencimiento, diasDeDiferencia } from '@/lib/utils/vencimiento';

export async function GET(req: NextRequest) {
  // El sidecar cron (docker/cron) envía "Authorization: Bearer <CRON_SECRET>".
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    // Fecha de hoy en zona America/Lima (UTC-5, sin horario de verano).
    const hoy = new Date(Date.now() - 5 * 3_600_000).toISOString().split('T')[0];

    const cfg = await prisma.company_config.findFirst({ select: { dias_alerta: true } });
    const diasAlerta = Number(cfg?.dias_alerta) || 7;

    const proyectos = await prisma.proyectos.findMany({
      select: {
        id: true,
        cliente: true,
        activo: true,
        comercial: { select: { fecha_entrega: true } },
        confirmaciones: { select: { etapa: true } },
      },
    });

    const yaEnviadas = await prisma.proyecto_alertas_enviadas.findMany({
      select: { proyecto_id: true, tipo: true },
    });
    const enviadasSet = new Set(yaEnviadas.map((r) => `${r.proyecto_id}:${r.tipo}`));

    const vigentes = new Set<string>();
    const detalle: { id: string; tipo: string }[] = [];
    let avisados = 0;

    for (const p of proyectos) {
      if (p.activo === false) continue;
      const fechaEntrega = p.comercial?.fecha_entrega ?? null;
      const confirmadas = new Set<EtapaFlujo>(p.confirmaciones.map((c) => c.etapa as EtapaFlujo));
      const estado = computeEstadoFromConfirmaciones(confirmadas);
      const tipo = clasificarVencimiento(fechaEntrega, hoy, diasAlerta, estado);
      if (!tipo) continue;

      const key = `${p.id}:${tipo}`;
      vigentes.add(key);
      if (enviadasSet.has(key)) continue;

      const etapa = FLOW_ETAPAS.find((e) => !confirmadas.has(e)) ?? 'completado';
      const dias = Math.abs(diasDeDiferencia(hoy, fechaEntrega as string));
      await notificar({
        proyectoId: p.id,
        tipo: 'vencimiento',
        mensaje: mensajeVencimiento(tipo, p.id, p.cliente ?? '', dias, ETAPA_LABEL[etapa]),
        rolesDestino: [rolDelAreaDeEtapa(etapa)],
        actorNombre: 'Sistema',
      });
      await prisma.proyecto_alertas_enviadas.create({ data: { proyecto_id: p.id, tipo } });
      avisados++;
      detalle.push({ id: p.id, tipo });
    }

    // Housekeeping: borrar dedups que ya no aplican (rearma la alerta futura)
    for (const r of yaEnviadas) {
      if (!vigentes.has(`${r.proyecto_id}:${r.tipo}`)) {
        await prisma.proyecto_alertas_enviadas.deleteMany({
          where: { proyecto_id: r.proyecto_id, tipo: r.tipo },
        });
      }
    }

    return NextResponse.json({ revisados: proyectos.length, avisados, detalle });
  } catch (err) {
    console.error('cron alertas-vencimiento error:', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
```

- [ ] **Step 8: Verificar**

```bash
npx tsc --noEmit          # 0 errores
curl -s http://localhost:3000/api/actividad -H "Cookie: $COOKIE" | head -c 200
curl -s http://localhost:3000/api/productividad -H "Cookie: $COOKIE" | head -c 200
curl -s http://localhost:3000/api/role-permissions -H "Cookie: $COOKIE" | head -c 200
curl -s http://localhost:3000/api/configuracion -H "Cookie: $COOKIE" | head -c 200
curl -si "http://localhost:3000/api/cron/alertas-vencimiento" -H "Authorization: Bearer $CRON_SECRET" | head -1   # 200
curl -si "http://localhost:3000/api/cron/alertas-vencimiento" | head -1                                            # 401
```

(Agregar `CRON_SECRET=<valor de dev>` a `.env`.)

- [ ] **Step 9: Commit**

```bash
git add app/api/actividad/ app/api/productividad/ app/api/role-permissions/ app/api/configuracion/ app/api/cron/
git commit -m "refactor: actividad, productividad, permisos, configuracion y cron a Prisma"
```

---

### Task 14: Storage a Cloudflare R2 (capa + rutas de documentos + subida browser)

**Files:**
- Create: `lib/r2/r2Client.ts`, `lib/r2/r2Storage.ts`
- Modify: `app/api/documentos/upload-url/route.ts`, `app/api/documentos/download-url/route.ts`, `app/api/documentos/[id]/route.ts`, `app/api/documentos/route.ts`, `app/api/documentos/eventos/route.ts`, `lib/utils/upload-documento.ts`

**Interfaces:**
- Produces:
  - `uploadToR2({key, body, contentType})`, `deleteFromR2(key)`, `getR2SignedUrl(key, expiresIn?, filename?)` (GET), `getR2UploadUrl(key, contentType?, expiresIn?)` (PUT).
  - `POST /api/documentos/upload-url` → `{ path, url }` (**antes `{path, token}`** — el único consumidor es `lib/utils/upload-documento.ts`, que se actualiza aquí mismo).
- Requiere en `.env`: `R2_ENDPOINT_URL`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_REGION=auto` (bucket propio de prueba mientras el ingeniero manda el real; free tier de R2).
- ⚠️ CORS del bucket: permitir `PUT`,`GET` desde `http://localhost:3000`, `http://localhost:3006` y el dominio final.

- [ ] **Step 1: `lib/r2/r2Client.ts`** (base: paquete del consultor)

```ts
import { S3Client } from '@aws-sdk/client-s3';

// Cloudflare R2 expone API compatible S3: mismo SDK, endpoint propio y region "auto".
export const r2Client = new S3Client({
  region: process.env.R2_REGION || 'auto',
  endpoint: process.env.R2_ENDPOINT_URL,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  },
});
```

- [ ] **Step 2: `lib/r2/r2Storage.ts`** (paquete del consultor + presigned PUT que faltaba)

```ts
import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { r2Client } from './r2Client';

const bucket = process.env.R2_BUCKET || '';

export async function uploadToR2(params: {
  key: string;
  body: Buffer | Uint8Array | string;
  contentType?: string;
}) {
  await r2Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
    })
  );
  return { bucket, key: params.key };
}

export async function deleteFromR2(key: string) {
  await r2Client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  return { bucket, key, deleted: true };
}

/** URL firmada de DESCARGA (GET). `filename` fuerza descarga con nombre legible. */
export async function getR2SignedUrl(key: string, expiresInSeconds = 3600, filename?: string) {
  return getSignedUrl(
    r2Client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ...(filename
        ? { ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(filename)}` }
        : {}),
    }),
    { expiresIn: expiresInSeconds }
  );
}

/** URL firmada de SUBIDA (PUT) — reemplaza createSignedUploadUrl de Supabase.
 *  El navegador sube directo con fetch PUT; el archivo no pasa por el server. */
export async function getR2UploadUrl(key: string, contentType?: string, expiresInSeconds = 600) {
  return getSignedUrl(
    r2Client,
    new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
    { expiresIn: expiresInSeconds }
  );
}
```

- [ ] **Step 3: `app/api/documentos/upload-url/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { getR2UploadUrl } from '@/lib/r2/r2Storage';
import { checkUploadPermission } from '@/lib/auth/permissions';
import type { Rol } from '@/types';

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const { proyecto_id, filename, content_type } = await request.json();
    if (!proyecto_id || !filename) {
      return NextResponse.json({ error: 'proyecto_id y filename requeridos' }, { status: 400 });
    }

    const userData = await prisma.users.findUnique({ where: { id: session.sub }, select: { rol: true } });
    if (!userData) {
      return NextResponse.json({ error: 'Usuario no registrado' }, { status: 403 });
    }
    if (!checkUploadPermission(userData.rol as Rol, filename)) {
      return NextResponse.json({ error: 'No autorizado para subir este tipo de archivo' }, { status: 403 });
    }

    const proyecto = await prisma.proyectos.findUnique({ where: { id: proyecto_id }, select: { id: true } });
    if (!proyecto) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });

    const safe = String(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${proyecto_id}/${crypto.randomUUID()}-${safe}`;

    const url = await getR2UploadUrl(path, typeof content_type === 'string' ? content_type : undefined);
    return NextResponse.json({ path, url });
  } catch (err) {
    console.error('POST /api/documentos/upload-url error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
```

- [ ] **Step 4: `lib/utils/upload-documento.ts`** (reemplazo completo — PUT directo)

```ts
import { MAX_FILE_SIZE } from '@/lib/constants';

/**
 * Sube un archivo a R2 (PUT directo con URL firmada) y registra sus metadatos.
 * El `prefix` clasifica el documento por área/tipo (ver DOC_PREFIX en constants).
 * Lanza Error con mensaje legible si algo falla.
 */
export const subirDocumento = async (
  proyectoId: string,
  file: File,
  prefix = ''
): Promise<void> => {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('El archivo supera el límite de 25MB.');
  }

  const contentType = file.type || 'application/octet-stream';
  const urlRes = await fetch('/api/documentos/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ proyecto_id: proyectoId, filename: file.name, content_type: contentType }),
  });
  if (!urlRes.ok) throw new Error('No se pudo iniciar la subida');
  const { path, url } = await urlRes.json();

  // PUT directo al bucket (requiere CORS del bucket para este origen)
  const putRes = await fetch(url, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': contentType },
  });
  if (!putRes.ok) throw new Error('No se pudo subir el archivo al almacenamiento');

  const tipo = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : null;
  const metaRes = await fetch('/api/documentos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ proyecto_id: proyectoId, nombre: prefix + file.name, tipo, storage_path: path }),
  });
  if (!metaRes.ok) throw new Error('No se pudo registrar el documento');
};
```

- [ ] **Step 5: `app/api/documentos/download-url/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { getR2SignedUrl } from '@/lib/r2/r2Storage';
import { logDocumentoEvento } from '@/lib/documento-eventos';

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const { storage_path } = await request.json();
    if (!storage_path || typeof storage_path !== 'string') {
      return NextResponse.json({ error: 'storage_path requerido' }, { status: 400 });
    }
    const doc = await prisma.proyecto_documentos.findFirst({
      where: { storage_path },
      select: { id: true, nombre: true, proyecto_id: true },
    });
    if (!doc) return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 });

    const url = await getR2SignedUrl(storage_path, 3600, doc.nombre);

    const userData = await prisma.users.findUnique({ where: { id: session.sub }, select: { nombre: true, rol: true } });
    await logDocumentoEvento({
      documentoId: doc.id,
      proyectoId: doc.proyecto_id,
      documentoNombre: doc.nombre,
      tipo: 'descarga',
      usuario: userData?.nombre,
      rol: userData?.rol,
    });

    return NextResponse.json({ url });
  } catch (err) {
    console.error('POST /api/documentos/download-url error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
```

- [ ] **Step 6: `app/api/documentos/[id]/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { deleteFromR2 } from '@/lib/r2/r2Storage';
import { logDocumentoEvento } from '@/lib/documento-eventos';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const userData = await prisma.users.findUnique({ where: { id: session.sub }, select: { nombre: true, rol: true } });
    if (userData?.rol !== 'Administrador') {
      return NextResponse.json({ error: 'Solo administradores pueden eliminar documentos' }, { status: 403 });
    }

    const doc = await prisma.proyecto_documentos.findUnique({
      where: { id },
      select: { storage_path: true, nombre: true, proyecto_id: true },
    });
    if (!doc) return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 });

    if (doc.storage_path) {
      try {
        await deleteFromR2(doc.storage_path);
      } catch (storageErr) {
        console.error('R2 delete falló:', storageErr); // metadatos se borran igual (paridad con hoy)
      }
    }
    await prisma.proyecto_documentos.delete({ where: { id } });

    await logDocumentoEvento({
      documentoId: id,
      proyectoId: doc.proyecto_id,
      documentoNombre: doc.nombre,
      tipo: 'eliminacion',
      usuario: userData?.nombre,
      rol: userData?.rol,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/documentos/[id] error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
```

- [ ] **Step 7: `app/api/documentos/route.ts`** — misma lógica, Prisma:

```ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { notificar } from '@/lib/notificaciones';
import { logDocumentoEvento } from '@/lib/documento-eventos';
import { DOC_PREFIX } from '@/lib/constants';
import type { Rol } from '@/types';
import { checkUploadPermission } from '@/lib/auth/permissions';

// GET: lista documentos (filtro opcional ?proyecto_id=)
export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const proyectoId = new URL(request.url).searchParams.get('proyecto_id');
    const data = await prisma.proyecto_documentos.findMany({
      where: proyectoId ? { proyecto_id: proyectoId } : undefined,
      include: { proyecto: { select: { cliente: true } } },
      orderBy: { created_at: 'desc' },
    });

    const docs = data.map((d) => ({
      id: d.id,
      proyecto_id: d.proyecto_id,
      cliente: d.proyecto?.cliente ?? '',
      nombre: d.nombre,
      tipo: d.tipo,
      storage_path: d.storage_path,
      subido_por: d.subido_por,
      subido_por_rol: d.subido_por_rol,
      created_at: d.created_at,
    }));
    return NextResponse.json(docs);
  } catch (err) {
    console.error('GET /api/documentos error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

// POST: registra los metadatos de un documento ya subido a R2
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const { proyecto_id, nombre, tipo, storage_path } = await request.json();
    if (typeof proyecto_id !== 'string' || typeof nombre !== 'string' || typeof storage_path !== 'string'
        || !proyecto_id || !nombre || !storage_path) {
      return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 });
    }
    if (nombre.length > 255) {
      return NextResponse.json({ error: 'Nombre demasiado largo' }, { status: 400 });
    }
    if (!storage_path.startsWith(`${proyecto_id}/`)) {
      return NextResponse.json({ error: 'storage_path inválido para este proyecto' }, { status: 400 });
    }

    const userData = await prisma.users.findUnique({ where: { id: session.sub }, select: { nombre: true, rol: true } });
    if (!userData) {
      return NextResponse.json({ error: 'Usuario no registrado' }, { status: 403 });
    }
    if (!checkUploadPermission(userData.rol as Rol, nombre)) {
      return NextResponse.json({ error: 'No autorizado para registrar este tipo de archivo' }, { status: 403 });
    }

    const data = await prisma.proyecto_documentos.create({
      data: {
        proyecto_id,
        nombre,
        tipo: tipo ?? null,
        storage_path,
        subido_por: userData.nombre ?? 'Sistema',
        subido_por_rol: userData.rol ?? null,
      },
    });

    await logDocumentoEvento({
      documentoId: data.id,
      proyectoId: proyecto_id,
      documentoNombre: nombre,
      tipo: 'subida',
      usuario: userData.nombre,
      rol: userData.rol,
    });

    // Enrutamiento del aviso por prefijo del nombre (igual que hoy)
    let rolesDestino: Rol[] = ['Comercial'];
    if (nombre.startsWith(DOC_PREFIX.comprobante)) rolesDestino = ['Finanzas'];
    else if (nombre.startsWith(DOC_PREFIX.oc) || nombre.startsWith(DOC_PREFIX.especificaciones)) rolesDestino = ['Ingeniería'];
    else if (nombre.startsWith(DOC_PREFIX.despiece)) rolesDestino = ['Producción'];

    await notificar({
      proyectoId: proyecto_id,
      tipo: 'documento',
      mensaje: `${userData.nombre ?? 'Alguien'} subió "${nombre}" a ${proyecto_id}.`,
      rolesDestino,
      actorId: session.sub,
      actorNombre: userData.nombre,
    });

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error('POST /api/documentos error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
```

- [ ] **Step 8: `app/api/documentos/eventos/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';

// Bitácora de actividad de documentos (últimos 100 eventos). Visible para autenticados.
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const data = await prisma.documento_eventos.findMany({
      orderBy: { created_at: 'desc' },
      take: 100,
    });
    return NextResponse.json(data);
  } catch (err) {
    console.error('GET /api/documentos/eventos error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
```

- [ ] **Step 9: Configurar bucket R2 de prueba + CORS** (Cloudflare dashboard → R2 → bucket → Settings → CORS policy):

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000", "http://localhost:3006"],
    "AllowedMethods": ["GET", "PUT"],
    "AllowedHeaders": ["content-type"],
    "MaxAgeSeconds": 3600
  }
]
```

Añadir a `.env` las 5 variables R2 con los valores del bucket de prueba.

- [ ] **Step 10: Verificar en el navegador** — subir un PDF en la pestaña Ingeniería de un proyecto → aparece en la lista; descargarlo (URL firmada abre/descarga con nombre legible); como Admin eliminarlo; pestaña Actividad de documentos registra los 3 eventos.

- [ ] **Step 11: Commit**

```bash
git add lib/r2/ app/api/documentos/ lib/utils/upload-documento.ts
git commit -m "feat: storage de documentos a Cloudflare R2 (presigned PUT/GET, delete)"
```

---

### Task 15: Build verde sin Supabase en el código de la app

**Files:**
- Delete: `lib/supabase/server.ts`, `lib/supabase/client.ts`, `lib/supabase/admin.ts`, `scripts/setup-storage.mjs`, `scripts/seed.ts`, `scripts/seed-demo.mjs`, `vercel.json`
- Modify: `package.json` (quitar `@supabase/ssr`, `@supabase/supabase-js`)

- [ ] **Step 1: Confirmar que ya nadie importa lib/supabase**

```bash
grep -rn "lib/supabase\|@supabase" --include="*.ts" --include="*.tsx" app/ components/ hooks/ lib/ store/ types/
```

Expected: 0 resultados (si aparece alguno, es un archivo que quedó sin migrar — migrarlo antes de seguir, con el patrón de las tasks previas).

- [ ] **Step 2: Borrar archivos y dependencias**

```bash
git rm lib/supabase/server.ts lib/supabase/client.ts lib/supabase/admin.ts scripts/setup-storage.mjs scripts/seed.ts scripts/seed-demo.mjs vercel.json
npm uninstall @supabase/ssr @supabase/supabase-js
```

(`scripts/backfill-confirmaciones.ts` también usa Supabase pero era un one-shot ya ejecutado → `git rm scripts/backfill-confirmaciones.ts`.)

- [ ] **Step 3: Build + lint + unit tests**

```bash
npm run build     # Expected: build OK
npm run lint      # Expected: 0 errores
npx tsx scripts/test-estado-proyecto.ts && npx tsx scripts/test-flujo-confirmaciones.ts && npx tsx scripts/test-vencimiento.ts && npx tsx scripts/test-notificaciones.ts && JWT_SECRET=un_secreto_de_al_menos_32_caracteres!! npx tsx scripts/test-session.ts
# Expected: todos en verde (funciones puras no tocadas + sesión)
```

- [ ] **Step 4: Smoke manual completo contra Postgres local** — login → crear proyecto → importar/editar materiales → firmar etapa → notificación al rol destino → subir/descargar documento → papelera/restaurar → configuración.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: retirar Supabase por completo (código, deps, vercel.json)"
```

---

### Task 16: Dockerización de producción (imagen + compose + sidecar cron)

**Files:**
- Create: `Dockerfile`, `.dockerignore`, `docker-compose.yml`, `docker/cron/Dockerfile`, `docker/cron/entrypoint.sh`, `.env.production.example`
- Modify: `next.config.ts`, `.gitignore`

**Interfaces:**
- `docker compose up -d --build` → app en `http://localhost:3006`, cron sidecar armado.
- El runner de standalone NO tiene npm: las migraciones corren en el arranque (CMD) con el CLI de Prisma copiado del builder; el seed se ejecuta con `node prisma/seed.mjs`.

- [ ] **Step 1: `next.config.ts`**

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Empaqueta un server.js autocontenido para la imagen Docker (etapa runner).
  output: "standalone",
};

export default nextConfig;
```

- [ ] **Step 2: `Dockerfile`**

```dockerfile
# --- deps: instala node_modules con el lockfile ---
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

# --- builder: genera Prisma Client y compila Next standalone ---
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# --- runner: imagen mínima non-root ---
FROM node:22-alpine AS runner
WORKDIR /app
# openssl: requerido por Prisma en musl; curl: healthcheck del compose
RUN apk add --no-cache openssl curl \
 && addgroup -S nodejs && adduser -S nextjs -G nodejs

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# CLI de Prisma + schema + migraciones + seed: el runner no tiene npm,
# así que "migrate deploy" y el seed corren con lo copiado del builder.
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --chown=nextjs:nodejs docker/start.sh ./start.sh
RUN chmod +x ./start.sh

USER nextjs
EXPOSE 3000
CMD ["./start.sh"]
```

- [ ] **Step 3: `docker/start.sh`**

```sh
#!/bin/sh
set -e
echo "Aplicando migraciones de base de datos..."
node node_modules/prisma/build/index.js migrate deploy
echo "Iniciando BBTI ERP..."
exec node server.js
```

- [ ] **Step 4: `.dockerignore`** (base del consultor, ampliado)

```text
node_modules
.next
.git
.env
.env.local
.env.production
npm-debug.log
Dockerfile
docker-compose.yml
docker-compose.dev.yml
docs
supabase
scripts
*.md
.playwright
e2e-results
bbti-erp-cambios-especificos
bbti-erp-consultor-docker-rds-r2
```

- [ ] **Step 5: `docker-compose.yml`** (producción)

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

- [ ] **Step 6: `docker/cron/Dockerfile` + `docker/cron/entrypoint.sh`**

`docker/cron/Dockerfile`:

```dockerfile
FROM alpine:3.20
RUN apk add --no-cache curl
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
CMD ["/entrypoint.sh"]
```

`docker/cron/entrypoint.sh`:

```sh
#!/bin/sh
# BusyBox crond NO hereda el entorno del contenedor en los jobs:
# generamos el crontab con el secreto ya interpolado al arrancar.
# 13:00 UTC = 08:00 America/Lima (sin horario de verano).
echo "0 13 * * * curl -fsS -H \"Authorization: Bearer ${CRON_SECRET}\" http://bbti-erp:3000/api/cron/alertas-vencimiento >> /proc/1/fd/1 2>&1" > /etc/crontabs/root
exec crond -f -l 8
```

- [ ] **Step 7: `.env.production.example`**

```env
NODE_ENV=production
PORT=3000

# App publicada por Docker Compose en http://<host>:3006

# PostgreSQL — completar con los accesos reales de AWS RDS que envíe el ingeniero.
# En desarrollo local: postgresql://postgres:postgres@host.docker.internal:5433/bbti?schema=gestion_proyectos
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DB_NAME?schema=gestion_proyectos&sslmode=require

# Sesiones JWT (mínimo 32 caracteres aleatorios; generar con: openssl rand -base64 48)
JWT_SECRET=

# Poner "true" cuando la app esté servida detrás de HTTPS (cookie Secure)
COOKIE_SECURE=false

# Cloudflare R2 (compatible S3)
R2_ENDPOINT_URL=https://ACCOUNT_ID.r2.cloudflarestorage.com
R2_BUCKET=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_REGION=auto

# Auth del endpoint de cron (generar con: openssl rand -hex 24)
CRON_SECRET=
```

- [ ] **Step 8: `.gitignore`** — debajo de `.env*` añadir la excepción:

```text
!.env.production.example
```

- [ ] **Step 9: Verificar el stack completo local** — crear `.env.production` real apuntando al Postgres dev (`host.docker.internal`) y al bucket R2 de prueba:

```bash
docker compose build
docker compose up -d
docker ps            # Expected: bbti-erp (healthy) y bbti-erp-cron corriendo
docker logs bbti-erp # Expected: "Aplicando migraciones..." y arranque limpio de Next
curl -s http://localhost:3006/api/health          # {"status":"OK",...}
docker compose exec bbti-erp node prisma/seed.mjs # seed dentro del contenedor
docker compose exec bbti-erp env | grep -E "DATABASE|R2_BUCKET"  # variables presentes
docker compose exec cron cat /etc/crontabs/root  # crontab con el secreto interpolado
```

Login en `http://localhost:3006` con `admin@bbti.com.pe / admin2024` → dashboard funcional.

- [ ] **Step 10: Commit**

```bash
git add Dockerfile .dockerignore docker-compose.yml docker/ next.config.ts .env.production.example .gitignore
git commit -m "feat: dockerización de producción (puerto 3006, migraciones al arranque, sidecar cron)"
```

---

### Task 17: Adaptar E2E y verificación integral

**Files:**
- Create: `scripts/lib/test-helpers.mjs`
- Delete: `scripts/lib/supabase-test.mjs`
- Modify: `scripts/e2e-confirmaciones.mjs`, `scripts/e2e-notificaciones.mjs`, `scripts/e2e-productividad.mjs`, `scripts/e2e-alertas-vencimiento.mjs`, `scripts/e2e-actividad-live.mjs`, `scripts/e2e-flujo-completo.mjs`, `scripts/verify-*.mjs`, `scripts/test-command-center.mjs`, `scripts/test-documentos-api.mjs`, `scripts/e2e-sweep.mjs` (los que importen el helper viejo)

**Interfaces:**
- Produces: `scripts/lib/test-helpers.mjs` exporta:
  - `getAuthCookie(email, password)` → header `Cookie` vía `POST /api/auth/login` real (lee `set-cookie`).
  - `db` → instancia PrismaClient para setup/teardown (reemplaza `serviceClient()`).
  - `BASE_URL` (default `http://localhost:3000`).

- [ ] **Step 1: `scripts/lib/test-helpers.mjs`**

```js
// Helpers de test post-migración: login HTTP real + Prisma para setup/teardown.
// Reemplaza a supabase-test.mjs (anonClient/serviceClient/getAuthCookie).
import { PrismaClient } from '@prisma/client';

export const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

export const db = new PrismaClient();

/** Cookie de sesión real: hace login contra la app y devuelve "bbti_session=...". */
export async function getAuthCookie(email, password) {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`login ${email}: HTTP ${res.status}`);
  const setCookie = res.headers.get('set-cookie') || '';
  const m = setCookie.match(/bbti_session=[^;]+/);
  if (!m) throw new Error('login sin Set-Cookie de sesión');
  return m[0];
}
```

- [ ] **Step 2: Adaptar cada script E2E/verify** — patrón mecánico por archivo:

1. `import { getAuthCookie, serviceClient, anonClient } from './lib/supabase-test.mjs'` → `import { getAuthCookie, db, BASE_URL } from './lib/test-helpers.mjs'` (ajustar ruta relativa).
2. Cada `serviceClient().from('<tabla>').select/insert/update/delete/upsert(...)` → llamada Prisma equivalente sobre `db.<tabla>` (`findMany/create(Many)/update(Many)/delete(Many)/upsert`). Recordar: `.eq('a', b)` → `where: { a: b }`; `.in('a', xs)` → `where: { a: { in: xs } }`; `maybeSingle()` → `findFirst`.
3. `anonClient()` (solo lo usaba el login del helper viejo) → desaparece.
4. Los scripts que consultan `role_permissions` para elegir un rol negado (e2e-productividad, e2e-confirmaciones) hacen la misma consulta con `db.role_permissions.findMany()`.
5. Al final de cada script: `await db.$disconnect()`.

- [ ] **Step 3: Correr las suites contra el stack local** (dev server + Postgres dev + R2 de prueba; BD seedeada)

```bash
npx tsx scripts/test-estado-proyecto.ts        # 11 unit
npx tsx scripts/test-flujo-confirmaciones.ts   # 27 unit
npx tsx scripts/test-vencimiento.ts            # 11 unit
node scripts/e2e-confirmaciones.mjs            # 12 asserts
node scripts/e2e-notificaciones.mjs            # 6 asserts
node scripts/e2e-productividad.mjs             # 11 asserts
node scripts/e2e-alertas-vencimiento.mjs       # 8 asserts
node scripts/e2e-actividad-live.mjs            # 3 asserts (el "en vivo" ahora es el polling de 10s: subir el timeout de 8s a 15s si hace falta)
node scripts/e2e-sweep.mjs                     # 8 páginas sin errores
```

Expected: todo verde. Cualquier rojo se depura ANTES de continuar (superpowers:systematic-debugging).

- [ ] **Step 4: Commit**

```bash
git add scripts/
git rm scripts/lib/supabase-test.mjs
git commit -m "test: E2E adaptados a auth propia y Prisma (helper test-helpers.mjs)"
```

---

### Task 18: README de despliegue + prueba de entrega

**Files:**
- Modify: `README.md` (sección de despliegue) — o crear `DEPLOY.md` si el README actual es de producto
- Verificación final de entrega en carpeta limpia

- [ ] **Step 1: Documentar el despliegue** (la ruta EXACTA del ingeniero en su Linux):

````markdown
## Despliegue con Docker Compose

Requisitos: Docker + Docker Compose, acceso a PostgreSQL (RDS) y credenciales R2.

```bash
git clone https://github.com/mirkovedia/bbti-erp
cd bbti-erp
cp .env.production.example .env.production
# Editar .env.production: DATABASE_URL (RDS + schema), JWT_SECRET, CRON_SECRET, R2_*
docker compose up -d --build
# Las migraciones corren solas en el arranque. Sembrar datos iniciales (una vez):
docker compose exec bbti-erp node prisma/seed.mjs
```

La aplicación queda en `http://<host>:3006`. Salud: `curl http://<host>:3006/api/health`.

### Validación

```bash
docker compose build
docker compose up -d
docker logs -f bbti-erp        # arranque limpio
docker exec -it bbti-erp sh    # env | grep DATABASE ; env | grep R2
```

### Notas de infraestructura

- El contenedor usa puerto interno 3000; Compose publica `3006:3000`.
- El sidecar `cron` dispara las alertas de vencimiento a las 08:00 Lima (13:00 UTC).
- El bucket R2 necesita CORS: métodos `PUT,GET` desde el dominio de la app.
- Detrás de HTTPS, poner `COOKIE_SECURE=true`.
- Usuario admin inicial: ver `prisma/seed.mjs`.

### Desarrollo local

```bash
docker compose -f docker-compose.dev.yml up -d   # Postgres 16 local
cp .env.production.example .env                  # ajustar DATABASE_URL a localhost
npx prisma migrate dev && npm run seed
npm run dev                                      # http://localhost:3000
```
````

- [ ] **Step 2: Prueba de entrega (simular al ingeniero)** — clonar el repo en una carpeta limpia y desplegar SOLO siguiendo el README:

```bash
cd /tmp && git clone <ruta-local-del-repo> bbti-erp-entrega && cd bbti-erp-entrega
cp .env.production.example .env.production
# completar con Postgres dev + R2 de prueba
docker compose up -d --build
docker compose exec bbti-erp node prisma/seed.mjs
curl -s http://localhost:3006/api/health
```

Expected: health OK y login funcional sin ningún paso que no esté en el README. Si algo faltó → corregir el README y repetir.

- [ ] **Step 3: Commit + push**

```bash
git add README.md
git commit -m "docs: instrucciones de despliegue Docker (3006, RDS, R2, cron)"
git push origin master
```

---

## Al terminar

- Corte a RDS cuando el ingeniero envíe accesos: editar `DATABASE_URL` en `.env.production` del servidor → `docker compose up -d` (las migraciones corren al arranque) → `docker compose exec bbti-erp node prisma/seed.mjs`.
- Pendientes externos (checklist con el ingeniero): accesos RDS + permisos `CREATE SCHEMA`/`CREATE TABLE`, credenciales R2 reales + CORS del dominio final, valor definitivo de `SCHEMA_NAME`, dominio/HTTPS (→ `COOKIE_SECURE=true`).
- Vercel se descontinúa después del corte (el deploy actual dejará de funcionar al remover Supabase del código en master — coordinar el momento del push con el usuario).
