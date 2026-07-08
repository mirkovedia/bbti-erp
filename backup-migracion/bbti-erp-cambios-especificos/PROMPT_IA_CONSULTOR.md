# Prompt para IA del consultor externo

Actúa como consultor senior Next.js/PostgreSQL/Docker.

Tengo el proyecto:

```text
https://github.com/mirkovedia/bbti-erp/tree/master
```

Es un ERP BBTI para gestión de proyectos de tableros eléctricos. Actualmente usa **Next.js 16 + Supabase**.

Necesito migrarlo a:

```text
Docker Compose + AWS RDS PostgreSQL + Cloudflare R2 compatible S3
```

## Objetivos técnicos

1. Dockerizar la app.
2. Publicar la app en puerto externo `3006`.
3. Cambiar la conexión de Supabase DB a AWS RDS PostgreSQL.
4. Usar un schema específico dentro de RDS.
5. Cambiar Supabase Storage a Cloudflare R2 compatible S3 AWS.
6. Mantener la app funcionando en producción.
7. Documentar variables y pasos.

## Datos RDS de prueba

```env
DB_HOST=database-1.cev8gk4y2dnb.us-east-1.rds.amazonaws.com
DB_PORT=5432
DB_USER=usuario
DB_PASSWORD=clave
DB_NAME=DATABASE_NAME
DB_SCHEMA=SCHEMA_NAME

DATABASE_URL=postgresql://usuario:clave@database-1.cev8gk4y2dnb.us-east-1.rds.amazonaws.com:5432/DATABASE_NAME?schema=SCHEMA_NAME
```

## Datos R2 de prueba

```env
R2_ENDPOINT_URL=https://xxx.r2.cloudflarestorage.com
R2_BUCKET=data-prod
R2_ACCESS_KEY_ID=741ec5bc0e1e0xx
R2_SECRET_ACCESS_KEY=xxxx
R2_REGION=auto
```

## Archivos a revisar primero

```text
package.json
next.config.ts
lib/
app/
components/
hooks/
store/
supabase/migrations/
proxy.ts
vercel.json
```

## Buscar usos de Supabase

Ejecutar:

```bash
grep -R "supabase" .
grep -R "createClient" .
grep -R "NEXT_PUBLIC_SUPABASE" .
grep -R "supabase.from" .
grep -R "supabase.storage" .
```

## Resultado esperado

Genera un plan de migración por fases y luego aplica cambios:

1. Dockerfile
2. docker-compose.yml
3. .dockerignore
4. .env.production.example
5. Configuración `output: "standalone"` en Next
6. Capa `lib/db`
7. Capa `lib/r2`
8. Reemplazo de consultas Supabase DB
9. Reemplazo de storage Supabase por R2
10. Documentación de despliegue
