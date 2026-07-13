# BBTI ERP — Docker + PostgreSQL (RDS) + Cloudflare R2

Este repositorio contiene la versión dockerizada de BBTI ERP, migrada desde Supabase/Vercel a un stack autocontenido y listo para producción.

## Despliegue con Docker Compose

Requisitos: Docker + Docker Compose, acceso a PostgreSQL (local o AWS RDS) y credenciales de almacenamiento compatible con S3 (MinIO o Cloudflare R2).

```bash
git clone https://github.com/mirkovedia/bbti-erp
cd bbti-erp
cp .env.production.example .env.production
# Editar .env.production: DATABASE_URL (RDS + schema), JWT_SECRET, CRON_SECRET, R2_*
docker compose up -d --build
# Las migraciones corren solas en el arranque. Sembrar datos iniciales (una vez):
docker compose exec bbti-erp node prisma/seed.mjs
```

La aplicación queda expuesta en `http://localhost:3006` (solo desarrollo local / pruebas internas).
Verificación de salud: `curl http://localhost:3006/api/health`

### Producción detrás de Traefik

En producción el módulo se sirve en **https://proyectos.bbtecnologia.com** vía Traefik — el puerto 3006 **no se publica**:

1. Quitar el mapeo `ports: "3006:3006"` del servicio `bbti-erp` (o sobreescribirlo con un override).
2. Adjuntar el servicio a la red de Traefik del servidor y apuntar el router al puerto interno `3006` del contenedor.
3. Traefik debe reenviar `X-Forwarded-Proto` (comportamiento por defecto) y `.env.production` debe llevar `COOKIE_SECURE=true`.

### Validación del Stack

```bash
docker compose build
docker compose up -d
docker logs -f bbti-erp        # arranque limpio
docker exec -it bbti-erp sh    # env | grep DATABASE ; env | grep R2
```

### Notas de infraestructura

- **Puertos:** El contenedor de Next.js escucha internamente en el puerto `3006` (3001–3005 ya están ocupados en el servidor). El mapeo `3006:3006` del compose es solo para desarrollo/pruebas; en producción Traefik enruta por la red interna.
- **Base de datos:** AWS RDS PostgreSQL, base `documental_platform`, schema `proyectos` — Prisma opera únicamente sobre ese schema (vía `?schema=proyectos` en `DATABASE_URL`). Contraseñas con caracteres especiales van URL-encodeadas.
- **Almacenamiento:** Cloudflare R2 privado, bucket dedicado `proyectos-prod` (recomendado; alternativa: `data-prod` con prefijo `proyectos/`). Las cargas/descargas usan **presigned URLs** generadas por el backend contra el **endpoint S3 API de R2** (no un custom domain del bucket). Nada del bucket se publica.
- **CORS en R2** (configuración exacta del bucket):
  - Origin: `https://proyectos.bbtecnologia.com`
  - Methods: `GET, PUT, HEAD`
  - Headers: `content-type, content-md5, x-amz-*, x-amz-checksum-*`
  - Expose: `etag`
- **Límite de subida:** parametrizado con `MAX_UPLOAD_MB` (MVP: 25; ajustable a 50/100 sin tocar código). El tamaño viaja firmado en la presigned URL — el storage rechaza cuerpos de otro tamaño.
- **Sidecar Cron:** El contenedor `cron` ejecuta el script de alertas de vencimiento diariamente a las 08:00 Lima (13:00 UTC).
- **Cookies y Seguridad:** Detrás de Traefik con HTTPS, establecer `COOKIE_SECURE=true` en `.env.production` (Traefik reenvía `X-Forwarded-Proto` por defecto).
- **Credenciales por defecto (Seed):** Ver usuarios iniciales en [prisma/seed.mjs](file:///c:/ClaudecodeProjects/BBTI/bbti-erp/prisma/seed.mjs) (ej. `admin@bbti.com.pe` / `admin2024`).

### Desarrollo local

Para levantar el entorno de desarrollo con la base de datos dockerizada local y la app corriendo en modo watch:

```bash
# 1. Levantar Postgres 16 y MinIO locales
docker compose -f docker-compose.dev.yml up -d

# 2. Configurar base de datos y esquema
cp .env.production.example .env
# (Asegurar que DATABASE_URL apunta al puerto 5433 local)
npx prisma migrate dev && npm run seed

# 3. Arrancar servidor de desarrollo
npm run dev # http://localhost:3000
```
