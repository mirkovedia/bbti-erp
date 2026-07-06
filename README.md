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

La aplicación queda expuesta en `http://localhost:3006`.
Verificación de salud: `curl http://localhost:3006/api/health`

### Validación del Stack

```bash
docker compose build
docker compose up -d
docker logs -f bbti-erp        # arranque limpio
docker exec -it bbti-erp sh    # env | grep DATABASE ; env | grep R2
```

### Notas de infraestructura

- **Puertos:** El contenedor de Next.js escucha internamente en el puerto `3000`; Compose lo mapea al puerto externo `3006:3000`.
- **Sidecar Cron:** El contenedor `cron` ejecuta el script de alertas de vencimiento diariamente a las 08:00 Lima (13:00 UTC).
- **CORS en R2:** El bucket de R2 necesita tener configurado CORS permitiendo los métodos `PUT` y `GET` desde el dominio final de la aplicación.
- **Cookies y Seguridad:** Detrás de un balanceador de carga o proxy reverso con HTTPS, recuerde establecer `COOKIE_SECURE=true` en `.env.production`.
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
