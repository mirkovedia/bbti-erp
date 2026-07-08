# Migración Docker + AWS RDS + Cloudflare R2

Este paquete contiene archivos base para que el consultor externo pueda iniciar la migración del proyecto `bbti-erp`.

## Objetivo

Migrar el proyecto a:

- Docker Compose
- Puerto externo `3006`
- PostgreSQL en AWS RDS
- Schema dedicado en RDS
- Cloudflare R2 compatible con S3 AWS

## Archivos incluidos

```text
Dockerfile
docker-compose.yml
.dockerignore
.env.production.example
next.config.ts.example
PROMPT_CONSULTOR_EXTERNO.md
src/lib/r2/r2Client.ts
src/lib/r2/r2Storage.ts
```

## Uso rápido

Copiar estos archivos en la raíz del proyecto.

Crear `.env.production`:

```bash
cp .env.production.example .env.production
```

Editar:

```env
DATABASE_URL=
DB_NAME=
DB_SCHEMA=
R2_ENDPOINT_URL=
R2_BUCKET=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
```

Levantar:

```bash
docker compose up -d --build
```

Abrir:

```text
http://localhost:3006
```

## Nota importante

Este paquete prepara Docker y variables, pero el código de aplicación debe ser revisado para reemplazar llamadas a Supabase por PostgreSQL/RDS y R2.
