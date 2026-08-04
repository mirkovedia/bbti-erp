# BBTI ERP — Stack autocontenido (Postgres + MinIO + Caddy propios)

**Fecha:** 2026-08-03
**Estado:** Aprobado por el usuario. Listo para plan de implementación.
**Reemplaza a:** `2026-07-02-migracion-docker-rds-r2-design.md` en lo relativo a
infraestructura externa (RDS, R2, Traefik del cliente). El resto de ese spec
(Prisma, JWT, presigned URLs, sidecar cron) sigue vigente y no se toca.

## Contexto

La migración a Docker + RDS + R2 se completó y validó (18 tareas, suites en
verde, RDS real conectado). Después cambió la situación del proyecto:

- El ingeniero de infraestructura del cliente dejó de reportar avances a su
  superior; el usuario asume la conclusión y entrega del proyecto.
- Se perdió el acceso a **AWS (RDS)** y a **Cloudflare (R2)**. No llegarán
  credenciales nuevas.
- No hay todavía VPS ni dominio contratados, y **no se contratarán antes de la
  entrega**: lo que se entrega es el sistema **funcionando de forma completa y
  demostrable**, quedando pendiente únicamente subirlo a un host y apuntarle un
  dominio.

El código ya es agnóstico de proveedor: habla SQL vía Prisma y la API S3 vía
`@aws-sdk/client-s3`, ambos configurados por variables de entorno. Cambiar de
infraestructura no requiere tocar código de aplicación.

## Objetivo

Un stack **autocontenido**: `docker compose up -d` levanta el sistema completo
—aplicación, base de datos, almacenamiento de archivos, tareas programadas,
backups y HTTPS— sin depender de ninguna cuenta ni servicio externo.

## Decisiones

| Decisión | Elección | Razón |
|---|---|---|
| Base de datos | Servicio `db` (Postgres 16) en el compose | RDS ya no está disponible; mismo motor, migraciones Prisma sin cambios |
| Almacenamiento | Servicio `minio` en el compose | R2 ya no está disponible; misma API S3, probado en desarrollo desde julio |
| Reverse proxy / HTTPS | **Caddy** (no Traefik) | VPS dedicado a una sola app: Caddy resuelve HTTPS automático con 3 líneas de configuración. Traefik aportaba enrutamiento multi-servicio que aquí no se usa |
| Compose | **Único** (5 servicios + backup) | A escala de 1 VPS y 1 operador, separar infra y app son dos comandos donde basta uno |
| Backup de BD | **`pg_dump`** (no el JSON de la app) | Captura la base entera (incluidas tablas futuras), no depende de que la app esté sana, y lo restaura cualquier PostgreSQL |
| Destino de backups | Volumen del VPS + copia manual a la PC del usuario | Sin cuentas externas nuevas. La copia en la PC es el "fuera del sistema" de la regla 3-2-1 |
| Retención | 30 días | Margen amplio para detectar un problema; el volumen de datos lo hace irrelevante en disco |
| Puertos publicados | Solo 80 y 443 (Caddy) | BD, storage y app quedan en la red interna de Docker — menos superficie que hoy, donde 3006 está expuesto |

## No-objetivos

- Contratar VPS o dominio (es justamente lo que queda pendiente tras la entrega).
- Alta disponibilidad, réplicas o clustering (7 usuarios internos).
- Migrar datos: el RDS solo contenía datos demo; `prisma/seed.mjs` los regenera.
- Reescribir código de aplicación: el cambio es de configuración e infraestructura.
- Manual de usuario por rol (se hará cuando haya fecha de capacitación).

---

## Diseño

### 1. Arquitectura

```text
┌───────────────────── VPS / máquina local ─────────────────────┐
│  Internet :80/:443                                            │
│       ↓                                                       │
│  ┌─────────┐  HTTPS automático (Let's Encrypt)                │
│  │  caddy  │  ${APP_DOMAIN} → bbti-erp:3006                   │
│  └────┬────┘  volúmenes: caddy-data, caddy-config             │
│       ↓ red interna de Docker                                 │
│  ┌──────────┐      ┌────────┐  volumen: pgdata                │
│  │ bbti-erp │─────→│   db   │  Postgres 16, schema proyectos  │
│  │  :3006   │      └────────┘                                 │
│  │          │      ┌────────┐  volumen: miniodata             │
│  │          │─────→│ minio  │  bucket bbti-documentos         │
│  └────┬─────┘      └────────┘                                 │
│       ↑                          ┌────────┐                   │
│  ┌────┴────┐ 08:00 Lima          │ backup │ 03:00 Lima        │
│  │  cron   │ alertas de          │        │ pg_dump + archivos│
│  └─────────┘ vencimiento         └────────┘ volumen: backups  │
└───────────────────────────────────────────────────────────────┘
```

Servicios: `caddy`, `bbti-erp`, `db`, `minio`, `cron`, `backup`.

### 2. Persistencia — dónde viven los datos

Tres volúmenes nombrados de Docker, en el disco del anfitrión
(`/var/lib/docker/volumes/`), fuera del ciclo de vida de los contenedores:

| Volumen | Contenido | Servicio |
|---|---|---|
| `pgdata` | Base de datos completa (proyectos, firmas, pagos, usuarios, permisos) | `db` |
| `miniodata` | Archivos: planos, metrados, comprobantes, OC | `minio` |
| `backups` | Últimos 30 días de respaldos | `backup` |

Sobreviven a: reinicios del contenedor, `docker compose down`, actualizaciones
de la aplicación y reinicios del servidor. **Se pierden únicamente con
`docker compose down -v`** — advertencia explícita en el README.

Además: `caddy-data` y `caddy-config` conservan los certificados TLS para no
re-solicitarlos en cada arranque (Let's Encrypt aplica límites de emisión).

### 3. Arranque y orden de dependencias

El contenedor de la aplicación aplica las migraciones al arrancar
(`docker/start.sh`). Con la base dentro del mismo compose, debe esperar a que
Postgres acepte conexiones:

- `db` declara healthcheck con `pg_isready`; `bbti-erp` depende de él con
  `condition: service_healthy`.
- `start.sh` reintenta `prisma migrate deploy` (backoff acotado) antes de
  rendirse: cubre el arranque simultáneo tras un reinicio del servidor.
- El bucket de MinIO se crea de forma idempotente al arrancar (servicio de
  inicialización efímero), replicando lo que en desarrollo se hizo a mano.

### 4. Backups automáticos

Servicio `backup` independiente del `cron` de alertas. Justificación: el cron
actual hace HTTP contra la app con `CRON_SECRET`; el backup necesita hablar
directo con Postgres y MinIO. Separados, **el backup funciona aunque la
aplicación esté caída** — el momento en que más se necesita.

Ejecución diaria a las 03:00 Lima (08:00 UTC). Salida por día:

```text
/backups/2026-08-03/db.sql.gz        ← pg_dump comprimido
/backups/2026-08-03/archivos.tar.gz  ← espejo del bucket MinIO
```

Al terminar, elimina los directorios con más de `BACKUP_RETENTION_DIAS` (30).

**Restauración** (comandos exactos en el README):

```bash
gunzip -c /backups/<fecha>/db.sql.gz | docker compose exec -T db psql -U <user> <db>
# archivos: descomprimir el tar y sincronizarlo al bucket con mc
```

**Copia fuera del servidor** (decisión del usuario: manual, sin cuentas nuevas):
un `scp -r` de una línea documentado en el README, con `.bat` opcional para
Windows.

El botón de backup/restore que ya existe en la aplicación se conserva para uso
manual puntual; el respaldo automático es el descrito aquí.

### 5. HTTPS y dominio

`Caddyfile` completo (sirve los dos modos, con y sin dominio):

```
{$APP_DOMAIN::80} {
    reverse_proxy bbti-erp:3006
}
```

Caddy obtiene y renueva el certificado de Let's Encrypt, redirige HTTP→HTTPS y
envía `X-Forwarded-Proto`, que es lo que la aplicación espera para
`COOKIE_SECURE=true`.

**Modo sin dominio** (situación actual y demo de la entrega): Caddy sigue siendo
la única puerta de entrada, pero sirve en HTTP por el puerto 80 sin intentar
emitir certificados. Se implementa con un `Caddyfile` que usa `{$APP_DOMAIN}`
por defecto `:80`: si la variable está vacía, Caddy escucha en el puerto 80 para
cualquier host (se accede por `http://localhost` o por la IP del servidor); si
tiene un dominio, activa HTTPS automático. Un único archivo cubre ambos modos y
**la regla "solo 80/443 publicados" se mantiene idéntica en los dos**.

Con `APP_DOMAIN` vacío se usa `COOKIE_SECURE=false`; al configurar el dominio se
cambia a `true` en el mismo `.env.production`. La ausencia de dominio no impide
que el sistema esté completo y demostrable.

### 6. Variables de entorno

`.env.production.example` se reescribe para el stack autocontenido:

```env
NODE_ENV=production
PORT=3006

# Dominio (vacío en modo demo/local; con dominio, Caddy emite HTTPS)
APP_DOMAIN=

# Base de datos interna del compose
POSTGRES_USER=bbti
POSTGRES_PASSWORD=            # generar
POSTGRES_DB=bbti_erp
DATABASE_URL=postgresql://bbti:PASSWORD@db:5432/bbti_erp?schema=proyectos

# Storage interno (MinIO, API S3)
R2_ENDPOINT_URL=http://minio:9000
R2_BUCKET=bbti-documentos
R2_ACCESS_KEY_ID=             # generar
R2_SECRET_ACCESS_KEY=         # generar
R2_REGION=auto
R2_FORCE_PATH_STYLE=true

JWT_SECRET=                   # generar (mín. 32 caracteres)
CRON_SECRET=                  # generar
COOKIE_SECURE=false           # true cuando haya dominio con HTTPS
MAX_UPLOAD_MB=25
BACKUP_RETENTION_DIAS=30
```

Los nombres `R2_*` se conservan aunque el proveedor sea MinIO: son la interfaz
S3 genérica que ya usa el código, y volver a R2/S3 gestionado será cambiar sus
valores. Renombrarlas obligaría a tocar código sin ganancia funcional.

`scripts/generar-secretos.sh` produce el bloque de secretos aleatorios listo
para pegar, evitando reutilizar los de desarrollo (que están en el historial
público del repositorio).

### 7. Ruta de vuelta a infraestructura gestionada

Documentada en el README para que la decisión de hoy no encierre al proyecto:

- **Base de datos gestionada**: apuntar `DATABASE_URL` al proveedor y quitar el
  servicio `db`. Las migraciones corren solas al arrancar.
- **Storage gestionado (R2/S3)**: cambiar las cinco variables `R2_*`, quitar
  `R2_FORCE_PATH_STYLE` y configurar CORS en el bucket. Sin cambios de código.

### 8. Verificación

Todo se comprueba en la máquina del usuario, sin VPS ni dominio:

1. **Arranque desde cero**: clone limpio → `docker compose up -d` → los seis
   servicios sanos, `/api/health` responde.
2. **Persistencia**: crear datos → `docker compose down` → `up -d` → los datos
   siguen presentes.
3. **Ciclo de backup**: ejecutar backup → destruir la base → restaurar →
   verificar que los datos volvieron. Automatizado como test.
4. **Suites existentes contra el stack nuevo**: seguridad (27), simulación
   multi-usuario (30), flujo completo (8), unitarias (75) — todas apuntando a
   Postgres y MinIO internos.
5. **Demo**: seed aplicado y un proyecto de ejemplo con flujo avanzado
   (documentos, firmas, notificaciones) listo para mostrar en vivo.

### 9. Documentación de entrega

- **README de despliegue**: los cuatro comandos del VPS, restauración de
  backups, resolución de problemas, advertencia sobre `down -v` y la ruta de
  vuelta a infraestructura gestionada.
- **`docs/ENTREGA.md`** (informe ejecutivo): qué se construyó, qué se validó y
  con qué evidencia, y el estado explícito de lo pendiente (contratar VPS y
  dominio) con los pasos exactos para completarlo.

### 10. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Todo vive en un servidor: un fallo total se lleva datos y backups | Copia manual periódica a la PC del usuario (documentada); la ruta a infraestructura gestionada queda abierta |
| `docker compose down -v` destruye los volúmenes | Advertencia destacada en el README; el backup diario acota la pérdida a 24 h |
| Migraciones al arrancar con la base aún no lista | Healthcheck `pg_isready` + `depends_on: service_healthy` + reintentos en `start.sh` |
| Certificados: límite de emisión de Let's Encrypt | Volúmenes `caddy-data`/`caddy-config` persisten los certificados entre reinicios |
| Secretos de desarrollo reutilizados en producción | `scripts/generar-secretos.sh` + instrucción explícita en el README |
| El backup nunca probado resulta no restaurable | Test automatizado del ciclo completo (punto 3 de verificación) |
