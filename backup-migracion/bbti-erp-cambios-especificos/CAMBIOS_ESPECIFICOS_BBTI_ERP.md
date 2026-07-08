# Cambios específicos para `mirkovedia/bbti-erp`

Repositorio revisado:

```text
https://github.com/mirkovedia/bbti-erp/tree/master
```

El proyecto es un ERP para gestión de proyectos de tableros eléctricos basado en **Next.js 16 + Supabase**.

## Estructura detectada

En la raíz del proyecto existen carpetas y archivos importantes:

```text
app/
components/
hooks/
lib/
public/
scripts/
store/
supabase/migrations/
types/
next.config.ts
package.json
package-lock.json
proxy.ts
vercel.json
```

## Objetivo de migración

Migrar el proyecto desde:

```text
Next.js + Supabase + Vercel
```

hacia:

```text
Next.js + Docker Compose + AWS RDS PostgreSQL + Cloudflare R2
```

La aplicación debe quedar expuesta en:

```text
http://localhost:3006
```

## Cambios a realizar

### 1. Dockerizar proyecto

Agregar:

```text
Dockerfile
docker-compose.yml
.dockerignore
.env.production.example
```

Modificar `next.config.ts` para agregar:

```ts
output: "standalone"
```

### 2. Puerto

El contenedor Next.js usará puerto interno `3000`.

Docker publicará puerto externo `3006`:

```yaml
ports:
  - "3006:3000"
```

### 3. Supabase a AWS RDS

Buscar en el proyecto:

```bash
grep -R "supabase" .
grep -R "createClient" .
grep -R "NEXT_PUBLIC_SUPABASE" .
grep -R "supabase.from" .
grep -R "supabase.storage" .
```

Reemplazar progresivamente por una capa propia:

```text
lib/db/
```

Variables destino:

```env
DATABASE_URL=postgresql://usuario:clave@database-1.cev8gk4y2dnb.us-east-1.rds.amazonaws.com:5432/DATABASE_NAME?schema=SCHEMA_NAME
DB_HOST=database-1.cev8gk4y2dnb.us-east-1.rds.amazonaws.com
DB_PORT=5432
DB_NAME=DATABASE_NAME
DB_SCHEMA=SCHEMA_NAME
DB_USER=usuario
DB_PASSWORD=clave
```

### 4. Supabase Storage a Cloudflare R2

Buscar:

```bash
grep -R "storage" .
grep -R "upload" .
grep -R "getPublicUrl" .
grep -R "createSignedUrl" .
```

Agregar capa:

```text
lib/r2/r2Client.ts
lib/r2/r2Storage.ts
```

Variables R2:

```env
R2_ENDPOINT_URL=https://xxx.r2.cloudflarestorage.com
R2_BUCKET=data-prod
R2_ACCESS_KEY_ID=741ec5bc0e1e0xx
R2_SECRET_ACCESS_KEY=xxxx
R2_REGION=auto
```

### 5. Migraciones SQL

El repo ya contiene:

```text
supabase/migrations/
```

Estas migraciones deben revisarse y adaptarse para ejecutarse en RDS PostgreSQL.

Revisar si usan funciones propias de Supabase:

```sql
auth.uid()
storage.objects
realtime
policies RLS dependientes de roles anon/authenticated
```

Si existen, deben reemplazarse por lógica propia del backend/app.

### 6. Auth

Si el proyecto usa Supabase Auth, no basta cambiar `DATABASE_URL`.

Opciones:

1. Mantener Supabase solo para Auth temporalmente.
2. Migrar Auth a NextAuth/Auth.js.
3. Crear auth propia contra PostgreSQL.

Decisión pendiente del consultor.

## Validación

```bash
docker compose build
docker compose up -d
docker logs -f bbti-erp
```

Abrir:

```text
http://localhost:3006
```

## Pendientes que debe confirmar el consultor

```text
DATABASE_NAME
SCHEMA_NAME
Si se mantiene Supabase Auth o se reemplaza
Tablas finales en RDS
Bucket/folders definitivos en R2
Estrategia de migración de datos Supabase -> RDS
```
