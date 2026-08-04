# BBTI ERP — Informe de estado y entrega

**Sistema:** ERP de gestión de proyectos de tableros eléctricos
**Fecha del informe:** 3 de agosto de 2026
**Repositorio:** `mirkovedia/bbti-erp` (rama `master`)

---

## 1. Resumen ejecutivo

El ERP está **funcionalmente completo y verificado**. Cubre el ciclo de vida
íntegro de un proyecto —desde que Comercial lo crea hasta que Finanzas lo cierra
con el pago al 100%— con control de permisos por área, trazabilidad de cada
acción y gestión documental.

Durante los últimos dos meses el sistema se **migró por completo** desde una
arquitectura dependiente de servicios de terceros (Supabase + Vercel) a un stack
propio basado en Docker, sin perder ninguna funcionalidad y ganando control,
seguridad y portabilidad.

**Lo único pendiente para ponerlo en producción es contratar un servidor y un
dominio.** El sistema corre hoy de forma completa y demostrable en un entorno
local con el mismo comando que se usará en el servidor definitivo.

---

## 2. Qué hace el sistema

| Área | Funcionalidad |
|---|---|
| **Comercial** | Crea la orden de proyecto, registra monto y fecha de entrega, sube OC, especificaciones técnicas y comprobante de adelanto, importa el metrado desde Excel |
| **Ingeniería** | Sube y versiona planos, controla su estado de aprobación, registra observaciones |
| **Logística** | Gestiona los materiales del metrado y el avance de compras |
| **Producción** | Controla las 7 etapas de fabricación con registro de quién completó cada una y cuándo |
| **Finanzas** | Registra pagos, controla el saldo por cobrar y autoriza el cierre del proyecto |
| **Transversal** | Panel de control con indicadores, calendario de entregas, notificaciones internas, bitácora de actividad, papelera con restauración, panel de productividad por persona, alertas automáticas de vencimiento |

**Control de acceso:** ocho roles con permisos configurables desde la propia
aplicación. Cada rol ve todo el sistema pero solo puede editar su área.

**Flujo con firmas:** el estado del proyecto no se edita a mano — se deriva de
las confirmaciones (sign-off) de cada etapa. Una etapa solo puede firmarse si los
datos de su área están completos, y el cierre exige el pago al 100%.

---

## 3. Arquitectura actual

| Capa | Tecnología |
|---|---|
| Aplicación (frontend + backend) | Next.js 16 con React 19, empaquetada en modo `standalone` |
| Base de datos | PostgreSQL, gestionada con Prisma ORM |
| Almacenamiento de archivos | Compatible S3 (planos, metrados, comprobantes) mediante URLs firmadas |
| Autenticación | Propia: JWT en cookie segura, contraseñas cifradas con bcrypt |
| Despliegue | Docker Compose (aplicación + tareas programadas) |
| Tareas automáticas | Contenedor cron: alertas diarias de vencimiento a las 08:00 (hora Lima) |

**Dimensiones del proyecto:** 84 archivos de código TypeScript, 23 endpoints de
API, 9 páginas, 20 componentes de interfaz, 21 tablas en base de datos.

---

## 4. Qué cambió: de Supabase/Vercel a stack propio

La migración se ejecutó en 18 tareas, cada una implementada, revisada y
verificada antes de continuar con la siguiente.

| Componente | Antes | Ahora | Beneficio |
|---|---|---|---|
| Base de datos | Supabase (servicio externo) | PostgreSQL con Prisma | Portable a cualquier servidor; sin dependencia de terceros |
| Autenticación | Supabase Auth | Propia (JWT + bcrypt) | Control total; sin cuentas externas |
| Archivos | Supabase Storage | Compatible S3 con URLs firmadas | Estándar de industria; intercambiable entre proveedores |
| Tiempo real | Supabase Realtime | Actualización automática propia | Sin dependencia externa |
| Hosting | Vercel | Docker Compose | Se despliega en cualquier servidor Linux |
| Tareas programadas | Vercel Cron | Contenedor cron propio | Incluido en el mismo despliegue |

**Resultado:** el sistema no depende de ninguna cuenta de servicio externo. Se
entrega como código fuente que cualquier servidor con Docker puede ejecutar.

### Mejoras posteriores a la migración

- **Actualización automática de pantallas:** los cambios de un usuario aparecen
  en la pantalla de los demás sin necesidad de recargar la página.
- **Auditoría de producción:** cada sub-etapa completada registra quién la
  confirmó y en qué fecha y hora exactas.
- **Fechas en horario de Lima** en todas las firmas y registros.
- **Límite de tamaño de archivos configurable** sin modificar código.
- **Cambio de contraseña por el propio usuario** desde la barra superior.

---

## 5. Seguridad

Se aplicó un paquete completo de medidas, verificadas con pruebas automatizadas:

| Medida | Qué previene |
|---|---|
| Contraseñas cifradas (bcrypt) y mínimo 12 caracteres | Robo de credenciales y claves adivinables |
| Bloqueo tras 5 intentos fallidos | Ataques de fuerza bruta |
| Respuesta de tiempo constante en el login | Descubrimiento de qué cuentas existen |
| Revocación inmediata de sesiones | Una sesión robada muere al cambiar la contraseña; desactivar un usuario le corta el acceso al instante |
| Cabeceras de seguridad (CSP y otras) | Ejecución de código malicioso y suplantación del sistema dentro de un sitio falso (phishing) |
| Verificación de origen en las modificaciones | Peticiones fraudulentas desde otros sitios |
| Validación estricta de todos los datos de entrada | Envío de datos malformados o maliciosos |
| Permisos revalidados en el servidor en cada petición | Manipulación de permisos desde el navegador |
| Bitácora de seguridad | Permite investigar incidentes: accesos, bloqueos y cambios de contraseña quedan registrados con IP |
| Archivos en almacenamiento privado con URLs firmadas temporales | Acceso no autorizado a planos y documentos |

---

## 6. Verificación y control de calidad

El sistema cuenta con **más de 190 verificaciones automatizadas** que se ejecutan
sobre el sistema real (no simulaciones):

| Suite | Qué comprueba | Resultado |
|---|---|---|
| Simulación multi-usuario | Los 7 usuarios reales ejercitando el ciclo completo: permisos de documentos por rol, firmas, pagos, notificaciones cruzadas | 30/30 |
| Seguridad | Cabeceras, revocación de sesiones, política de contraseñas, bloqueos, bitácora | 27/27 |
| Flujo de negocio completo | De la creación del proyecto al cierre con pago al 100% | 8/8 |
| Confirmaciones de etapa | Firmas, validaciones, permisos, reversión en cascada | 12/12 |
| Documentos, metrado, notificaciones, productividad, alertas, actividad | Funcionalidades específicas | Todas en verde |
| Pruebas unitarias | Lógica de negocio pura (estados, vencimientos, pagos, sesiones) | 75/75 |

Además: verificación de tipos y análisis estático sin errores, compilación de
producción exitosa, y **integración continua** que ejecuta todas estas
comprobaciones automáticamente en cada cambio del código.

---

## 7. Estado actual

### Completado y verificado

- Aplicación completa, migrada y funcionando.
- Empaquetado en Docker, listo para desplegar.
- Paquete de seguridad implementado y probado.
- Suite de verificación automatizada.
- Documentación técnica de despliegue.

### En curso

- **Stack autocontenido:** diseño aprobado para que el despliegue incluya también
  la base de datos y el almacenamiento de archivos dentro del mismo Docker
  Compose, junto con respaldos automáticos diarios. Elimina la necesidad de
  contratar servicios de base de datos o almacenamiento por separado.
  Especificación en `docs/superpowers/specs/2026-08-03-stack-autocontenido-design.md`.

### Pendiente (infraestructura)

| Pendiente | Qué implica | Tiempo estimado |
|---|---|---|
| Contratar servidor (VPS) | Cualquier proveedor con Docker; costo aproximado 6–10 USD/mes | 30 minutos |
| Contratar dominio | Registro anual, aproximadamente 10–15 USD | 15 minutos |
| Desplegar | Cuatro comandos documentados; certificado HTTPS automático | 30 minutos |

Una vez contratados el servidor y el dominio, la puesta en producción es de
aproximadamente **una hora**, siguiendo la guía de despliegue del repositorio.

---

## 8. Cómo se despliega

```bash
# 1. Instalar Docker en el servidor
curl -fsSL https://get.docker.com | sh

# 2. Obtener el código y configurar
git clone <repositorio> && cd bbti-erp
cp .env.production.example .env.production
# Editar el archivo con los datos del servidor y las claves generadas

# 3. Levantar el sistema completo
docker compose up -d

# 4. Cargar los datos iniciales (una sola vez)
docker compose exec bbti-erp node prisma/seed.mjs
```

Las actualizaciones de la base de datos se aplican solas al arrancar. El
certificado HTTPS se obtiene y renueva automáticamente.

**Respaldos:** el sistema genera una copia diaria de la base de datos y de los
archivos, conservando los últimos 30 días. La restauración está documentada paso
a paso.

---

## 9. Continuidad y escalabilidad

- **Escalabilidad:** el sistema está diseñado para crecer sin rediseño. La base
  de datos y el almacenamiento se pueden mover a servicios gestionados en la nube
  cambiando únicamente configuración, sin modificar código.
- **Sin dependencias propietarias:** todas las tecnologías empleadas son
  estándares abiertos (PostgreSQL, S3, Docker), lo que evita quedar atado a un
  proveedor.
- **Mantenibilidad:** el código está documentado, tipado y cubierto por pruebas
  automatizadas que detectan regresiones ante cualquier cambio futuro.
