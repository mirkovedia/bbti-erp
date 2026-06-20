# Diseño: Eliminar Documentos/Alertas y ampliar Reportes

**Fecha:** 2026-06-20
**Estado:** Aprobado para implementación

## Contexto

El ERP BBTI tiene en el sidebar items que sobran o están muy simples:

- **Documentos** (`/documentos`): página global que solo lista archivos de todos los
  proyectos + un historial de actividad. Los archivos **ya** se suben y gestionan dentro
  de cada proyecto (pestaña Ingeniería), por lo que la vista global es duplicación.
- **Alertas** (`/alertas`): página que genera alertas en vivo desde el estado de los
  proyectos. Se quiere eliminar.
- **Reportes** (`/reportes`): hoy solo 4 KPIs, 1 gráfico de barras por estado y una lista
  "por vencer". Demasiado básico.

Toda la data de Reportes se carga client-side desde `/api/proyectos`, así que las mejoras
son cómputo derivado con `useMemo`: sin cambios de API ni de base de datos.

## Alcance

### 1. Eliminar Documentos (vista global)

- Borrar la carpeta `app/(dashboard)/documentos/`.
- Quitar el item `{ href: '/documentos', label: 'Documentos', icon: FileText }` de
  `components/layout/Sidebar.tsx`.
- **No tocar:** APIs `/api/documentos/*`, subida desde la pestaña Ingeniería del proyecto,
  ni la campanita de Notificaciones (`NotificacionesBell`). Solo desaparece la vista global.

### 2. Eliminar Alertas (página + menú)

- Borrar la carpeta `app/(dashboard)/alertas/`.
- Quitar el item `{ href: '/alertas', label: 'Alertas', icon: Bell }` del `Sidebar.tsx`.
- **No tocar:** campos `alerta` en `comercial`/`finanzas`, config `dias_alerta`, ni la
  sección "por vencer" de Reportes (que sigue usando `dias_alerta`).

### 3. Ampliar Reportes

Reorganizar la página en **3 pestañas** con una **barra de filtros global** arriba (afecta
a las tres). Todo el filtrado y agregación es client-side con `useMemo`.

#### Filtros globales (siempre visibles)

- Rango de fechas por `fecha_creacion` (desde / hasta).
- Estado (`EstadoProyecto` o "todos").
- Responsable (`usuario_nombre` o "todos").

Se aplican primero; el resultado (`filtered`) alimenta KPIs, gráficos y tablas. La
exportación PDF/Excel existente respeta los filtros activos.

#### Pestaña "General"

- KPIs existentes recalculados sobre `filtered`: Total Órdenes, Monto Total, Retrasadas,
  Tasa Completado.
- Gráfico de barras por estado (existente).
- **Nuevo:** gráfico de torta — distribución % por estado (`PieChart` de recharts).
- **Nuevo:** tendencia mensual — `LineChart` con nº de órdenes y monto agrupados por mes
  de `fecha_creacion`.
- Lista "por vencer" (existente, usa `dias_alerta`).

#### Pestaña "Financiero"

- KPIs: Monto Total, **Cobrado**, **Pendiente**, **Ticket Promedio**.
  - **Cobrado** = `finanzas.adelanto` + suma de `finanzas.pagos[].monto` (por proyecto).
  - **Pendiente** = `max(0, monto − cobrado)`.
  - **Ticket Promedio** = Monto Total / nº de órdenes (0 si no hay órdenes).
- Gráfico de barras: monto por estado.
- Tabla **Top clientes por monto** (agrupado por `cliente`, ordenado desc, top 5).
- Tabla **Proyectos de mayor valor** (ordenado por `monto` desc, top 5).

#### Pestaña "Responsables"

- Tabla por `usuario_nombre`: nº de proyectos, completados, tasa de completado %, y carga
  actual (proyectos con estado != COMPLETADO).
- Gráfico de barras: proyectos por responsable.

## Arquitectura

- Un solo archivo client component `app/(dashboard)/reportes/page.tsx` (ya existe).
- Estado local: `proyectos`, `loading`, `warningDays` (existentes) + `tab`
  (`'general' | 'financiero' | 'responsables'`) + filtros (`fechaDesde`, `fechaHasta`,
  `estadoFiltro`, `responsableFiltro`).
- `filtered = useMemo(...)` aplica los filtros sobre `proyectos`.
- Cada bloque de agregación (chartData, pieData, trendData, finanzas, responsables) es su
  propio `useMemo` derivado de `filtered`.
- Colores de estado: reutilizar `ESTADO_COLORS` ya definido.

Si el archivo crece demasiado, extraer las tablas/gráficos a componentes en
`components/reportes/`. Decisión durante implementación según tamaño real.

## Manejo de errores / casos borde

- Sin proyectos o filtro sin resultados: cada pestaña muestra estado vacío ("No hay datos
  para los filtros seleccionados").
- División por cero en tasas/ticket: devolver 0.
- Fechas inválidas/ausentes en `fecha_creacion`: excluir del agrupado mensual, no romper.
- Botón "Limpiar filtros" para resetear.

## Testing

- Verificación manual: `npm run build` y `npm run lint` deben pasar.
- Revisar visualmente las 3 pestañas con datos y con filtros que devuelvan 0 resultados.
- Confirmar que el sidebar ya no muestra Documentos ni Alertas y que sus rutas dan 404.

## Fuera de alcance

- Cambios en APIs o base de datos.
- Tocar la campanita de Notificaciones.
- Eliminar campos `alerta` o config `dias_alerta`.
