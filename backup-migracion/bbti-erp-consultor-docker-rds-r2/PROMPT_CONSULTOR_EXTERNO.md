# Prompt para consultor externo / IA de apoyo

## Contexto general

Necesito apoyar la migración del proyecto `bbti-erp` hacia una arquitectura desplegable con Docker, PostgreSQL en AWS RDS y almacenamiento de archivos en Cloudflare R2 compatible con S3.

Repositorio base:

```text
https://github.com/mirkovedia/bbti-erp/tree/master
```

El objetivo no es cambiar la funcionalidad del sistema, sino preparar una migración técnica ordenada:

1. Dockerizar el proyecto.
2. Cambiar el puerto externo de ejecución a `3006`.
3. Reemplazar dependencia directa de Supabase por PostgreSQL en AWS RDS.
4. Usar un schema específico dentro de RDS.
5. Integrar Cloudflare R2 como almacenamiento compatible con S3 AWS.
6. Mantener variables de entorno claras y seguras.
7. Dejar el proyecto listo para desplegar en servidor Linux con Docker Compose.

---

## Estado esperado

La aplicación debe correr con:

```bash
docker compose up -d --build
```

Y quedar disponible en:

```text
http://localhost:3006
```

El contenedor internamente puede seguir usando puerto `3000`, pero Docker debe publicar:

```yaml
ports:
  - "3006:3000"
```

---

## Base de datos destino

La base de datos ya no debe depender de Supabase.

Debe conectarse a PostgreSQL en AWS RDS:

```text
Host: database-1.cev8gk4y2dnb.us-east-1.rds.amazonaws.com
Puerto: 5432
Usuario de prueba: usuario
Clave de prueba: clave
```

El proyecto debe usar un schema PostgreSQL dentro de esa base.

Ejemplo de variable:

```env
DATABASE_URL=postgresql://usuario:clave@database-1.cev8gk4y2dnb.us-east-1.rds.amazonaws.com:5432/DATABASE_NAME?schema=SCHEMA_NAME
```

Pendiente por confirmar:

```text
DATABASE_NAME
SCHEMA_NAME
```

---

## Cloudflare R2 compatible S3 AWS

Se debe integrar R2 como almacenamiento de objetos compatible con S3.

Variables esperadas:

```env
R2_ENDPOINT_URL=https://xxx.r2.cloudflarestorage.com
R2_BUCKET=data-prod
R2_ACCESS_KEY_ID=741ec5bc0e1e0xx
R2_SECRET_ACCESS_KEY=xxxx
R2_REGION=auto
```

Implementación recomendada en Node/Next:

- Usar `@aws-sdk/client-s3`
- Configurar `endpoint`
- Configurar `region: "auto"`
- Configurar credenciales con `R2_ACCESS_KEY_ID` y `R2_SECRET_ACCESS_KEY`
- Usar `forcePathStyle: true` si es necesario

Ejemplo conceptual:

```ts
import { S3Client } from "@aws-sdk/client-s3";

export const r2Client = new S3Client({
  region: process.env.R2_REGION || "auto",
  endpoint: process.env.R2_ENDPOINT_URL,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});
```

---

## Tareas para la IA/consultor

### 1. Revisar estructura del proyecto

Analizar:

```text
package.json
next.config.*
src/
app/
lib/
utils/
services/
supabase/
```

Buscar uso de:

```text
createClient
@supabase/supabase-js
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
supabase.from(...)
supabase.storage
```

---

### 2. Dockerizar

Agregar o validar:

```text
Dockerfile
docker-compose.yml
.dockerignore
.env.production.example
```

Para Next.js, validar que `next.config.ts` tenga:

```ts
const nextConfig = {
  output: "standalone",
};
```

---

### 3. Migrar Supabase a PostgreSQL RDS

Identificar si el proyecto usa Supabase para:

- Auth
- Base de datos
- Storage
- Realtime
- Edge Functions

Si solo usa base de datos, migrar a:

- Prisma, o
- Drizzle, o
- `pg` directo, o
- una capa API propia.

Recomendación: crear una capa `lib/db` y centralizar consultas.

---

### 4. Migrar Storage de Supabase a Cloudflare R2

Si existe uso de `supabase.storage`, reemplazarlo por funciones equivalentes:

- `uploadFile`
- `getFile`
- `deleteFile`
- `getSignedUrl`

Usar AWS SDK S3 compatible.

---

### 5. Seguridad

No subir `.env.production` real al repositorio.

Solo subir:

```text
.env.production.example
```

Los secretos reales deben ir en el servidor o en el sistema CI/CD.

---

## Resultado esperado del consultor

Entregar:

1. Docker funcional.
2. Variables de entorno documentadas.
3. Código sin dependencia directa a Supabase para DB.
4. Integración R2 compatible S3.
5. Instrucciones de despliegue.
6. Lista de cambios realizados.
7. Lista de pendientes si alguna parte depende de lógica Supabase Auth/Storage.

---

## Validación mínima

Después de aplicar cambios:

```bash
docker compose build
docker compose up -d
docker logs -f bbti-erp
```

Probar:

```text
http://localhost:3006
```

Verificar conexión DB:

```bash
docker exec -it bbti-erp sh
```

Validar variables:

```bash
env | grep DATABASE
env | grep R2
```
