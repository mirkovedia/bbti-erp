# Limpieza (Documentos/Alertas) y ampliación de Reportes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar la vista global de Documentos y la página de Alertas, y ampliar Reportes con filtros globales, más gráficos, análisis financiero y rendimiento por responsable.

**Architecture:** Todo es frontend. La lógica de agregación vive en funciones puras en `lib/utils/reportes.ts`; cada pestaña de Reportes es un componente en `components/reportes/`; `app/(dashboard)/reportes/page.tsx` orquesta fetch + estado de filtros + tabs. Sin cambios de API ni de base de datos.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind, recharts ^3.8.1 (ya instalado), lucide-react.

## Global Constraints

- TypeScript strict: nunca `any`, usar `unknown` + type guards.
- Identificadores en inglés; comentarios en español.
- Named exports (excepto pages/layouts de Next que usan default export).
- Componentes como arrow functions con props tipadas.
- Verificación de cada tarea: `npm run lint` y `npm run build` deben pasar (no hay runner de tests unitarios en este repo).
- Reutilizar helpers existentes: `fm`, `nf`, `diasRestantes` de `lib/utils/format.ts`.
- Reutilizar `ESTADO_COLORS` y el patrón de colores de estado existente.
- Moneda: usar `fm()` para todos los montos (respeta la moneda configurada).

---

### Task 1: Eliminar la vista global de Documentos

**Files:**
- Delete: `app/(dashboard)/documentos/page.tsx` (y la carpeta `documentos/` si queda vacía)
- Modify: `components/layout/Sidebar.tsx` (quitar item de navegación)

**Interfaces:**
- Consumes: nada.
- Produces: nada (solo elimina superficie de UI).

- [ ] **Step 1: Borrar la página de documentos**

```bash
git rm app/(dashboard)/documentos/page.tsx
```

(En Windows PowerShell, si `git rm` con paréntesis da problemas, usar comillas: `git rm "app/(dashboard)/documentos/page.tsx"`.)

- [ ] **Step 2: Quitar el item del sidebar**

En `components/layout/Sidebar.tsx`, eliminar esta línea del array `navItems`:

```tsx
  { href: '/documentos', label: 'Documentos', icon: FileText },
```

Y quitar `FileText` del import de `lucide-react` (líneas 6-17) **solo si no se usa en otro lugar del archivo** (no se usa: el único uso es este item).

- [ ] **Step 3: Verificar lint y build**

Run: `npm run lint`
Expected: sin errores nuevos.

Run: `npm run build`
Expected: build OK. La ruta `/documentos` ya no existe (404).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: eliminar vista global de documentos del sidebar"
```

---

### Task 2: Eliminar la página de Alertas

**Files:**
- Delete: `app/(dashboard)/alertas/page.tsx` (y la carpeta `alertas/` si queda vacía)
- Modify: `components/layout/Sidebar.tsx` (quitar item de navegación)

**Interfaces:**
- Consumes: nada.
- Produces: nada.

- [ ] **Step 1: Borrar la página de alertas**

```bash
git rm "app/(dashboard)/alertas/page.tsx"
```

- [ ] **Step 2: Quitar el item del sidebar**

En `components/layout/Sidebar.tsx`, eliminar del array `navItems`:

```tsx
  { href: '/alertas', label: 'Alertas', icon: Bell },
```

Y quitar `Bell` del import de `lucide-react` **solo si no se usa en otro lugar** (no se usa en Sidebar tras quitar el item).

- [ ] **Step 3: Verificar lint y build**

Run: `npm run lint`
Expected: sin errores nuevos.

Run: `npm run build`
Expected: build OK. La ruta `/alertas` ya no existe (404).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: eliminar pagina de alertas del sidebar"
```

---

### Task 3: Funciones puras de agregación para Reportes

**Files:**
- Create: `lib/utils/reportes.ts`

**Interfaces:**
- Consumes: tipos `Proyecto`, `EstadoProyecto` de `@/types`.
- Produces (firmas que las pestañas usarán):
  - `interface ReportesFiltros { fechaDesde: string; fechaHasta: string; estado: EstadoProyecto | ''; responsable: string }`
  - `applyFiltros(proyectos: Proyecto[], f: ReportesFiltros): Proyecto[]`
  - `estadoCount(proyectos: Proyecto[]): { estado: EstadoProyecto; estadoCorto: string; cantidad: number }[]`
  - `montoPorEstado(proyectos: Proyecto[]): { estado: EstadoProyecto; estadoCorto: string; monto: number }[]`
  - `tendenciaMensual(proyectos: Proyecto[]): { mes: string; ordenes: number; monto: number }[]`
  - `cobradoDe(p: Proyecto): number`
  - `finanzasResumen(proyectos: Proyecto[]): { montoTotal: number; cobrado: number; pendiente: number; ticket: number }`
  - `topClientes(proyectos: Proyecto[], n: number): { cliente: string; monto: number; ordenes: number }[]`
  - `topProyectos(proyectos: Proyecto[], n: number): { id: string; cliente: string; monto: number; estado: EstadoProyecto }[]`
  - `porResponsable(proyectos: Proyecto[]): { responsable: string; total: number; completados: number; tasa: number; carga: number }[]`
  - `responsablesUnicos(proyectos: Proyecto[]): string[]`

- [ ] **Step 1: Crear `lib/utils/reportes.ts` con todas las funciones puras**

```ts
import type { Proyecto, EstadoProyecto } from '@/types';

// Estados en el orden canónico usado en los gráficos.
export const ESTADOS_ORDEN: EstadoProyecto[] = [
  'EN INGENIERÍA',
  'COMPRAS EN CURSO',
  'EN PRODUCCIÓN',
  'LISTO PARA PRUEBAS',
  'RETRASADO',
  'COMPLETADO',
];

// Acorta una etiqueta de estado para ejes de gráficos.
const corto = (estado: string): string =>
  estado.length > 12 ? `${estado.slice(0, 11)}…` : estado;

export interface ReportesFiltros {
  fechaDesde: string;
  fechaHasta: string;
  estado: EstadoProyecto | '';
  responsable: string;
}

export const FILTROS_VACIOS: ReportesFiltros = {
  fechaDesde: '',
  fechaHasta: '',
  estado: '',
  responsable: '',
};

// Aplica los filtros globales sobre la lista de proyectos.
export const applyFiltros = (proyectos: Proyecto[], f: ReportesFiltros): Proyecto[] =>
  proyectos.filter((p) => {
    if (f.estado && p.estado !== f.estado) return false;
    if (f.responsable && p.usuario_nombre !== f.responsable) return false;
    if (f.fechaDesde && (p.fecha_creacion ?? '') < f.fechaDesde) return false;
    if (f.fechaHasta && (p.fecha_creacion ?? '') > f.fechaHasta) return false;
    return true;
  });

// Cantidad de proyectos por estado, en orden canónico.
export const estadoCount = (proyectos: Proyecto[]) =>
  ESTADOS_ORDEN.map((estado) => ({
    estado,
    estadoCorto: corto(estado),
    cantidad: proyectos.filter((p) => p.estado === estado).length,
  }));

// Monto total acumulado por estado, en orden canónico.
export const montoPorEstado = (proyectos: Proyecto[]) =>
  ESTADOS_ORDEN.map((estado) => ({
    estado,
    estadoCorto: corto(estado),
    monto: proyectos
      .filter((p) => p.estado === estado)
      .reduce((acc, p) => acc + (p.monto || 0), 0),
  }));

// Órdenes y monto agrupados por mes (YYYY-MM) de fecha_creacion, orden ascendente.
export const tendenciaMensual = (proyectos: Proyecto[]) => {
  const mapa = new Map<string, { ordenes: number; monto: number }>();
  for (const p of proyectos) {
    const fecha = p.fecha_creacion;
    if (!fecha || fecha.length < 7) continue; // excluir fechas inválidas/ausentes
    const mes = fecha.slice(0, 7);
    const actual = mapa.get(mes) ?? { ordenes: 0, monto: 0 };
    actual.ordenes += 1;
    actual.monto += p.monto || 0;
    mapa.set(mes, actual);
  }
  return Array.from(mapa.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, v]) => ({ mes, ordenes: v.ordenes, monto: v.monto }));
};

// Cobrado de un proyecto = adelanto de finanzas + suma de pagos.
export const cobradoDe = (p: Proyecto): number => {
  const adelanto = p.finanzas?.adelanto ?? 0;
  const pagos = (p.finanzas?.pagos ?? []).reduce((acc, pago) => acc + (pago.monto || 0), 0);
  return adelanto + pagos;
};

// Resumen financiero global de la lista filtrada.
export const finanzasResumen = (proyectos: Proyecto[]) => {
  const montoTotal = proyectos.reduce((acc, p) => acc + (p.monto || 0), 0);
  const cobrado = proyectos.reduce((acc, p) => acc + cobradoDe(p), 0);
  const pendiente = Math.max(0, montoTotal - cobrado);
  const ticket = proyectos.length > 0 ? montoTotal / proyectos.length : 0;
  return { montoTotal, cobrado, pendiente, ticket };
};

// Top N clientes por monto acumulado.
export const topClientes = (proyectos: Proyecto[], n: number) => {
  const mapa = new Map<string, { monto: number; ordenes: number }>();
  for (const p of proyectos) {
    const actual = mapa.get(p.cliente) ?? { monto: 0, ordenes: 0 };
    actual.monto += p.monto || 0;
    actual.ordenes += 1;
    mapa.set(p.cliente, actual);
  }
  return Array.from(mapa.entries())
    .map(([cliente, v]) => ({ cliente, monto: v.monto, ordenes: v.ordenes }))
    .sort((a, b) => b.monto - a.monto)
    .slice(0, n);
};

// Top N proyectos de mayor monto.
export const topProyectos = (proyectos: Proyecto[], n: number) =>
  [...proyectos]
    .sort((a, b) => (b.monto || 0) - (a.monto || 0))
    .slice(0, n)
    .map((p) => ({ id: p.id, cliente: p.cliente, monto: p.monto || 0, estado: p.estado }));

// Rendimiento por responsable.
export const porResponsable = (proyectos: Proyecto[]) => {
  const mapa = new Map<string, { total: number; completados: number; carga: number }>();
  for (const p of proyectos) {
    const nombre = p.usuario_nombre || '—';
    const actual = mapa.get(nombre) ?? { total: 0, completados: 0, carga: 0 };
    actual.total += 1;
    if (p.estado === 'COMPLETADO') actual.completados += 1;
    else actual.carga += 1;
    mapa.set(nombre, actual);
  }
  return Array.from(mapa.entries())
    .map(([responsable, v]) => ({
      responsable,
      total: v.total,
      completados: v.completados,
      tasa: v.total > 0 ? Math.round((v.completados / v.total) * 100) : 0,
      carga: v.carga,
    }))
    .sort((a, b) => b.total - a.total);
};

// Lista de responsables únicos (para el filtro), ordenados alfabéticamente.
export const responsablesUnicos = (proyectos: Proyecto[]): string[] =>
  Array.from(new Set(proyectos.map((p) => p.usuario_nombre).filter(Boolean))).sort();
```

- [ ] **Step 2: Verificar que typecheckea**

Run: `npx tsc --noEmit`
Expected: sin errores en `lib/utils/reportes.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/utils/reportes.ts
git commit -m "feat: helpers de agregacion para reportes"
```

---

### Task 4: Barra de filtros globales

**Files:**
- Create: `components/reportes/ReportesFiltros.tsx`

**Interfaces:**
- Consumes: `ReportesFiltros`, `ESTADOS_ORDEN` de `@/lib/utils/reportes`; `EstadoProyecto` de `@/types`.
- Produces:
  - `interface ReportesFiltrosProps { filtros: ReportesFiltros; onChange: (f: ReportesFiltros) => void; responsables: string[] }`
  - `export const ReportesFiltrosBar = (props: ReportesFiltrosProps) => JSX`

- [ ] **Step 1: Crear `components/reportes/ReportesFiltros.tsx`**

```tsx
'use client';

import { X } from 'lucide-react';
import type { EstadoProyecto } from '@/types';
import {
  type ReportesFiltros,
  ESTADOS_ORDEN,
  FILTROS_VACIOS,
} from '@/lib/utils/reportes';

interface ReportesFiltrosProps {
  filtros: ReportesFiltros;
  onChange: (f: ReportesFiltros) => void;
  responsables: string[];
}

const inputCls =
  'px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

export const ReportesFiltrosBar = ({ filtros, onChange, responsables }: ReportesFiltrosProps) => {
  const set = (patch: Partial<ReportesFiltros>) => onChange({ ...filtros, ...patch });
  const hayFiltros =
    filtros.fechaDesde || filtros.fechaHasta || filtros.estado || filtros.responsable;

  return (
    <div className="bg-[var(--navy2)] rounded-xl border border-slate-800 p-4 flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-slate-400">Desde</label>
        <input
          type="date"
          value={filtros.fechaDesde}
          onChange={(e) => set({ fechaDesde: e.target.value })}
          className={inputCls}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-slate-400">Hasta</label>
        <input
          type="date"
          value={filtros.fechaHasta}
          onChange={(e) => set({ fechaHasta: e.target.value })}
          className={inputCls}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-slate-400">Estado</label>
        <select
          value={filtros.estado}
          onChange={(e) => set({ estado: e.target.value as EstadoProyecto | '' })}
          className={inputCls}
        >
          <option value="">Todos</option>
          {ESTADOS_ORDEN.map((es) => (
            <option key={es} value={es}>{es}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-slate-400">Responsable</label>
        <select
          value={filtros.responsable}
          onChange={(e) => set({ responsable: e.target.value })}
          className={inputCls}
        >
          <option value="">Todos</option>
          {responsables.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>
      {hayFiltros && (
        <button
          onClick={() => onChange(FILTROS_VACIOS)}
          className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-300 hover:text-white bg-slate-800/60 border border-slate-700 rounded-lg transition-colors"
        >
          <X className="w-4 h-4" />
          Limpiar
        </button>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add components/reportes/ReportesFiltros.tsx
git commit -m "feat: barra de filtros globales de reportes"
```

---

### Task 5: Pestaña General (KPIs + barras + torta + tendencia + por vencer)

**Files:**
- Create: `components/reportes/TabGeneral.tsx`

**Interfaces:**
- Consumes: `Proyecto`, `EstadoProyecto`; helpers `estadoCount`, `tendenciaMensual` de `@/lib/utils/reportes`; `fm`, `diasRestantes` de `@/lib/utils/format`; `StatusBadge`.
- Produces:
  - `interface TabGeneralProps { proyectos: Proyecto[]; warningDays: number }`
  - `export const TabGeneral = (props: TabGeneralProps) => JSX`
  - exporta también la constante compartida `export const ESTADO_COLORS: Record<EstadoProyecto, string>` (las demás pestañas la importan desde aquí para no duplicar).

- [ ] **Step 1: Crear `components/reportes/TabGeneral.tsx`**

```tsx
'use client';

import { useMemo } from 'react';
import { BarChart3, DollarSign, AlertTriangle, CheckCircle2, TrendingUp, PieChart as PieIcon } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend, LineChart, Line,
} from 'recharts';
import type { Proyecto, EstadoProyecto } from '@/types';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { fm, diasRestantes } from '@/lib/utils/format';
import { estadoCount, tendenciaMensual } from '@/lib/utils/reportes';

// Fuente única de colores por estado, reutilizada por todas las pestañas.
export const ESTADO_COLORS: Record<EstadoProyecto, string> = {
  'EN PRODUCCIÓN': '#2563eb',
  'LISTO PARA PRUEBAS': '#f59e0b',
  'EN INGENIERÍA': '#06b6d4',
  'COMPRAS EN CURSO': '#8b5cf6',
  RETRASADO: '#f43f5e',
  COMPLETADO: '#10b981',
};

const tooltipStyle = {
  backgroundColor: '#0b1225',
  border: '1px solid #334155',
  borderRadius: 8,
  color: '#fff',
};

interface TabGeneralProps {
  proyectos: Proyecto[];
  warningDays: number;
}

export const TabGeneral = ({ proyectos, warningDays }: TabGeneralProps) => {
  const total = proyectos.length;
  const montoTotal = proyectos.reduce((acc, p) => acc + (p.monto || 0), 0);
  const retrasados = proyectos.filter((p) => p.estado === 'RETRASADO').length;
  const completados = proyectos.filter((p) => p.estado === 'COMPLETADO').length;
  const tasaCompletado = total > 0 ? Math.round((completados / total) * 100) : 0;

  const barData = useMemo(() => estadoCount(proyectos), [proyectos]);
  const pieData = useMemo(
    () => barData.filter((d) => d.cantidad > 0),
    [barData]
  );
  const trendData = useMemo(() => tendenciaMensual(proyectos), [proyectos]);

  const porVencer = useMemo(
    () =>
      proyectos
        .map((p) => ({ p, dias: diasRestantes(p.comercial?.fecha_entrega) }))
        .filter(({ dias }) => dias !== null && dias >= 0 && dias <= warningDays)
        .sort((a, b) => (a.dias ?? 0) - (b.dias ?? 0)),
    [proyectos, warningDays]
  );

  const kpis = [
    { label: 'Total Órdenes', value: String(total), icon: BarChart3, color: 'text-blue-400' },
    { label: 'Monto Total', value: fm(montoTotal), icon: DollarSign, color: 'text-cyan-400' },
    { label: 'Retrasadas', value: String(retrasados), icon: AlertTriangle, color: 'text-red-400' },
    { label: 'Tasa Completado', value: `${tasaCompletado}%`, icon: CheckCircle2, color: 'text-green-400' },
  ];

  if (total === 0) {
    return (
      <div className="bg-[var(--navy2)] rounded-xl border border-slate-800 p-12 text-center">
        <BarChart3 className="w-16 h-16 mx-auto mb-4 text-slate-600" />
        <p className="text-slate-400">No hay datos para los filtros seleccionados.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div key={kpi.label} className="bg-[var(--navy2)] rounded-xl border border-slate-800 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-400">{kpi.label}</p>
                <Icon className="w-4 h-4 text-slate-500" />
              </div>
              <p className={`text-2xl font-bold mt-2 ${kpi.color}`}>{kpi.value}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Barras por estado */}
        <div className="bg-[var(--navy2)] rounded-xl border border-slate-800 p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-semibold text-white">Distribución por Estado</h2>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="estadoCorto" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.estado ?? ''}
                />
                <Bar dataKey="cantidad" radius={[6, 6, 0, 0]}>
                  {barData.map((entry) => (
                    <Cell key={entry.estado} fill={ESTADO_COLORS[entry.estado]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Torta de distribución */}
        <div className="bg-[var(--navy2)] rounded-xl border border-slate-800 p-6">
          <div className="flex items-center gap-2 mb-4">
            <PieIcon className="w-5 h-5 text-violet-400" />
            <h2 className="text-lg font-semibold text-white">Proporción por Estado</h2>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="cantidad"
                  nameKey="estado"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  label={(entry) => `${entry.cantidad}`}
                >
                  {pieData.map((entry) => (
                    <Cell key={entry.estado} fill={ESTADO_COLORS[entry.estado]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Tendencia mensual */}
      <div className="bg-[var(--navy2)] rounded-xl border border-slate-800 p-6">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-5 h-5 text-cyan-400" />
          <h2 className="text-lg font-semibold text-white">Tendencia mensual</h2>
        </div>
        {trendData.length === 0 ? (
          <p className="text-slate-400 text-sm">Sin datos de fechas para graficar.</p>
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="mes" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <YAxis yAxisId="left" allowDecimals={false} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
                <Line yAxisId="left" type="monotone" dataKey="ordenes" name="Órdenes" stroke="#06b6d4" strokeWidth={2} />
                <Line yAxisId="right" type="monotone" dataKey="monto" name="Monto" stroke="#f59e0b" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Por vencer */}
      <div className="bg-[var(--navy2)] rounded-xl border border-slate-800 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">
          Órdenes por vencer (próximos {warningDays} días)
        </h2>
        {porVencer.length === 0 ? (
          <p className="text-slate-400 text-sm">No hay órdenes próximas a vencer.</p>
        ) : (
          <div className="space-y-2">
            {porVencer.map(({ p, dias }) => (
              <div
                key={p.id}
                className="flex items-center justify-between p-3 bg-slate-800/40 rounded-lg border border-slate-800"
              >
                <div className="flex items-center gap-3">
                  <span className="text-blue-400 font-mono text-sm">{p.id}</span>
                  <span className="text-white text-sm">{p.cliente}</span>
                  <StatusBadge estado={p.estado} />
                </div>
                <span className={`text-sm font-medium ${dias === 0 ? 'text-red-400' : 'text-amber-400'}`}>
                  {dias === 0 ? 'Vence hoy' : `${dias} día${dias === 1 ? '' : 's'}`}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add components/reportes/TabGeneral.tsx
git commit -m "feat: pestana general de reportes con torta y tendencia"
```

---

### Task 6: Pestaña Financiero

**Files:**
- Create: `components/reportes/TabFinanciero.tsx`

**Interfaces:**
- Consumes: `Proyecto`; helpers `finanzasResumen`, `montoPorEstado`, `topClientes`, `topProyectos` de `@/lib/utils/reportes`; `fm` de `@/lib/utils/format`; `ESTADO_COLORS` de `./TabGeneral`; `StatusBadge`.
- Produces:
  - `interface TabFinancieroProps { proyectos: Proyecto[] }`
  - `export const TabFinanciero = (props: TabFinancieroProps) => JSX`

- [ ] **Step 1: Crear `components/reportes/TabFinanciero.tsx`**

```tsx
'use client';

import { useMemo } from 'react';
import { DollarSign, Wallet, Clock, Receipt } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import type { Proyecto } from '@/types';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { fm } from '@/lib/utils/format';
import { finanzasResumen, montoPorEstado, topClientes, topProyectos } from '@/lib/utils/reportes';
import { ESTADO_COLORS } from './TabGeneral';

const tooltipStyle = {
  backgroundColor: '#0b1225',
  border: '1px solid #334155',
  borderRadius: 8,
  color: '#fff',
};

interface TabFinancieroProps {
  proyectos: Proyecto[];
}

export const TabFinanciero = ({ proyectos }: TabFinancieroProps) => {
  const resumen = useMemo(() => finanzasResumen(proyectos), [proyectos]);
  const montoEstado = useMemo(
    () => montoPorEstado(proyectos).filter((d) => d.monto > 0),
    [proyectos]
  );
  const clientes = useMemo(() => topClientes(proyectos, 5), [proyectos]);
  const proyectosTop = useMemo(() => topProyectos(proyectos, 5), [proyectos]);

  if (proyectos.length === 0) {
    return (
      <div className="bg-[var(--navy2)] rounded-xl border border-slate-800 p-12 text-center">
        <DollarSign className="w-16 h-16 mx-auto mb-4 text-slate-600" />
        <p className="text-slate-400">No hay datos para los filtros seleccionados.</p>
      </div>
    );
  }

  const kpis = [
    { label: 'Monto Total', value: fm(resumen.montoTotal), icon: DollarSign, color: 'text-cyan-400' },
    { label: 'Cobrado', value: fm(resumen.cobrado), icon: Wallet, color: 'text-green-400' },
    { label: 'Pendiente', value: fm(resumen.pendiente), icon: Clock, color: 'text-amber-400' },
    { label: 'Ticket Promedio', value: fm(resumen.ticket), icon: Receipt, color: 'text-blue-400' },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div key={kpi.label} className="bg-[var(--navy2)] rounded-xl border border-slate-800 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-400">{kpi.label}</p>
                <Icon className="w-4 h-4 text-slate-500" />
              </div>
              <p className={`text-2xl font-bold mt-2 ${kpi.color}`}>{kpi.value}</p>
            </div>
          );
        })}
      </div>

      {/* Monto por estado */}
      <div className="bg-[var(--navy2)] rounded-xl border border-slate-800 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Monto por estado</h2>
        {montoEstado.length === 0 ? (
          <p className="text-slate-400 text-sm">Sin montos para graficar.</p>
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={montoEstado}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="estadoCorto" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value: number) => fm(value)}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.estado ?? ''}
                />
                <Bar dataKey="monto" radius={[6, 6, 0, 0]}>
                  {montoEstado.map((entry) => (
                    <Cell key={entry.estado} fill={ESTADO_COLORS[entry.estado]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top clientes */}
        <div className="bg-[var(--navy2)] rounded-xl border border-slate-800 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Top 5 clientes por monto</h2>
          <div className="space-y-2">
            {clientes.map((c, i) => (
              <div key={c.cliente} className="flex items-center justify-between p-3 bg-slate-800/40 rounded-lg border border-slate-800">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-slate-500 text-sm font-mono">{i + 1}</span>
                  <span className="text-white text-sm truncate">{c.cliente}</span>
                  <span className="text-slate-400 text-xs shrink-0">{c.ordenes} órd.</span>
                </div>
                <span className="text-cyan-400 text-sm font-medium shrink-0">{fm(c.monto)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Proyectos de mayor valor */}
        <div className="bg-[var(--navy2)] rounded-xl border border-slate-800 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Proyectos de mayor valor</h2>
          <div className="space-y-2">
            {proyectosTop.map((p) => (
              <div key={p.id} className="flex items-center justify-between p-3 bg-slate-800/40 rounded-lg border border-slate-800">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-blue-400 font-mono text-sm">{p.id}</span>
                  <span className="text-white text-sm truncate">{p.cliente}</span>
                  <StatusBadge estado={p.estado} />
                </div>
                <span className="text-cyan-400 text-sm font-medium shrink-0">{fm(p.monto)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add components/reportes/TabFinanciero.tsx
git commit -m "feat: pestana financiero de reportes"
```

---

### Task 7: Pestaña Responsables

**Files:**
- Create: `components/reportes/TabResponsables.tsx`

**Interfaces:**
- Consumes: `Proyecto`; helper `porResponsable` de `@/lib/utils/reportes`.
- Produces:
  - `interface TabResponsablesProps { proyectos: Proyecto[] }`
  - `export const TabResponsables = (props: TabResponsablesProps) => JSX`

- [ ] **Step 1: Crear `components/reportes/TabResponsables.tsx`**

```tsx
'use client';

import { useMemo } from 'react';
import { Users } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { Proyecto } from '@/types';
import { porResponsable } from '@/lib/utils/reportes';

const tooltipStyle = {
  backgroundColor: '#0b1225',
  border: '1px solid #334155',
  borderRadius: 8,
  color: '#fff',
};

interface TabResponsablesProps {
  proyectos: Proyecto[];
}

export const TabResponsables = ({ proyectos }: TabResponsablesProps) => {
  const data = useMemo(() => porResponsable(proyectos), [proyectos]);

  if (data.length === 0) {
    return (
      <div className="bg-[var(--navy2)] rounded-xl border border-slate-800 p-12 text-center">
        <Users className="w-16 h-16 mx-auto mb-4 text-slate-600" />
        <p className="text-slate-400">No hay datos para los filtros seleccionados.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Gráfico proyectos por responsable */}
      <div className="bg-[var(--navy2)] rounded-xl border border-slate-800 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-5 h-5 text-blue-400" />
          <h2 className="text-lg font-semibold text-white">Proyectos por responsable</h2>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="responsable" tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="total" name="Total" fill="#2563eb" radius={[6, 6, 0, 0]} />
              <Bar dataKey="carga" name="En curso" fill="#f59e0b" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tabla de rendimiento */}
      <div className="bg-[var(--navy2)] rounded-xl border border-slate-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400">
              <th className="text-left font-medium px-4 py-3">Responsable</th>
              <th className="text-right font-medium px-4 py-3">Total</th>
              <th className="text-right font-medium px-4 py-3">Completados</th>
              <th className="text-right font-medium px-4 py-3">En curso</th>
              <th className="text-right font-medium px-4 py-3">Tasa</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {data.map((r) => (
              <tr key={r.responsable} className="hover:bg-slate-800/30 transition-colors">
                <td className="px-4 py-3 text-white">{r.responsable}</td>
                <td className="px-4 py-3 text-right text-slate-300">{r.total}</td>
                <td className="px-4 py-3 text-right text-green-400">{r.completados}</td>
                <td className="px-4 py-3 text-right text-amber-400">{r.carga}</td>
                <td className="px-4 py-3 text-right text-white font-medium">{r.tasa}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add components/reportes/TabResponsables.tsx
git commit -m "feat: pestana responsables de reportes"
```

---

### Task 8: Reescribir `page.tsx` como orquestador (fetch + filtros + tabs + export)

**Files:**
- Modify (reescritura completa): `app/(dashboard)/reportes/page.tsx`

**Interfaces:**
- Consumes: `TabGeneral`, `TabFinanciero`, `TabResponsables`, `ReportesFiltrosBar`; helpers `applyFiltros`, `responsablesUnicos`, `FILTROS_VACIOS`, `type ReportesFiltros`; `exportToExcel`, `exportToPDF`; `ExportMenu`; `fm`.
- Produces: la página `/reportes`.

- [ ] **Step 1: Reemplazar el contenido completo de `app/(dashboard)/reportes/page.tsx`**

```tsx
'use client';

import { useEffect, useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import type { Proyecto } from '@/types';
import { ExportMenu } from '@/components/shared/ExportMenu';
import { exportToExcel, exportToPDF } from '@/lib/utils/export';
import { fm } from '@/lib/utils/format';
import {
  applyFiltros,
  responsablesUnicos,
  FILTROS_VACIOS,
  type ReportesFiltros,
} from '@/lib/utils/reportes';
import { ReportesFiltrosBar } from '@/components/reportes/ReportesFiltros';
import { TabGeneral } from '@/components/reportes/TabGeneral';
import { TabFinanciero } from '@/components/reportes/TabFinanciero';
import { TabResponsables } from '@/components/reportes/TabResponsables';

type TabId = 'general' | 'financiero' | 'responsables';

const TABS: { id: TabId; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'financiero', label: 'Financiero' },
  { id: 'responsables', label: 'Responsables' },
];

export default function ReportesPage() {
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [warningDays, setWarningDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabId>('general');
  const [filtros, setFiltros] = useState<ReportesFiltros>(FILTROS_VACIOS);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/proyectos');
        const data = await res.json();
        setProyectos(Array.isArray(data) ? data : []);

        const configRes = await fetch('/api/configuracion');
        const configData = await configRes.json();
        if (configData && configData.dias_alerta !== undefined) {
          setWarningDays(Number(configData.dias_alerta) || 7);
        }
      } catch (err) {
        console.error('Error fetching data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const filtrados = useMemo(() => applyFiltros(proyectos, filtros), [proyectos, filtros]);
  const responsables = useMemo(() => responsablesUnicos(proyectos), [proyectos]);

  const handleExportExcel = () => {
    const rows = filtrados.map((p) => ({
      ID: p.id,
      Cliente: p.cliente,
      Estado: p.estado,
      Monto: p.monto,
      Responsable: p.usuario_nombre,
      'Fecha Creación': p.fecha_creacion,
      'Fecha Entrega': p.comercial?.fecha_entrega ?? '',
      Progreso: `${p.produccion?.progreso ?? 0}%`,
    }));
    exportToExcel(rows, 'reporte-bbti', 'Proyectos');
  };

  const handleExportPDF = () => {
    const columns = [
      { header: 'ID', key: 'id' },
      { header: 'Cliente', key: 'cliente' },
      { header: 'Estado', key: 'estado' },
      { header: 'Monto', key: 'monto' },
      { header: 'Responsable', key: 'responsable' },
      { header: 'Entrega', key: 'entrega' },
    ];
    const rows = filtrados.map((p) => ({
      id: p.id,
      cliente: p.cliente,
      estado: p.estado,
      monto: fm(p.monto || 0),
      responsable: p.usuario_nombre,
      entrega: p.comercial?.fecha_entrega ?? '—',
    }));
    exportToPDF('Reporte de Proyectos', columns, rows, 'reporte-bbti');
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-slate-800 rounded animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 bg-slate-800/50 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="h-80 bg-slate-800/50 rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Reportes</h1>
          <p className="text-slate-400 mt-1">Indicadores y análisis de proyectos</p>
        </div>
        <ExportMenu onExportPDF={handleExportPDF} onExportExcel={handleExportExcel} disabled={filtrados.length === 0} />
      </div>

      <ReportesFiltrosBar filtros={filtros} onChange={setFiltros} responsables={responsables} />

      {/* Tabs */}
      <div className="border-b border-slate-800 overflow-x-auto scrollbar-none">
        <nav className="flex gap-1 min-w-max">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors shrink-0',
                tab === t.id
                  ? 'bg-slate-800 text-blue-400 border-b-2 border-blue-400'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              )}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {tab === 'general' && <TabGeneral proyectos={filtrados} warningDays={warningDays} />}
      {tab === 'financiero' && <TabFinanciero proyectos={filtrados} />}
      {tab === 'responsables' && <TabResponsables proyectos={filtrados} />}
    </div>
  );
}
```

- [ ] **Step 2: Verificar lint y build**

Run: `npm run lint`
Expected: sin errores nuevos.

Run: `npm run build`
Expected: build OK.

- [ ] **Step 3: Verificación visual**

Run: `npm run dev` y abrir `/reportes`.
Comprobar:
- Las 3 pestañas cambian y muestran su contenido.
- Los filtros (fechas, estado, responsable) recalculan KPIs/gráficos/tablas.
- "Limpiar" resetea los filtros.
- Un filtro que no devuelva resultados muestra el estado vacío en cada pestaña.
- El export PDF/Excel descarga respetando los filtros activos.
- El sidebar ya no muestra Documentos ni Alertas.

- [ ] **Step 4: Commit**

```bash
git add app/(dashboard)/reportes/page.tsx
git commit -m "feat: reportes con filtros globales y pestanas (general/financiero/responsables)"
```

---

## Notas de verificación final

- Confirmar que `components/shared/StatusBadge` acepta `estado: EstadoProyecto` (ya usado en la página original).
- Confirmar que `ExportMenu` y `exportToExcel`/`exportToPDF` existen en las rutas indicadas (ya importados en la página original).
- recharts ^3.8.1 exporta `PieChart`, `Pie`, `LineChart`, `Line`, `Legend` (todos disponibles en v3).
