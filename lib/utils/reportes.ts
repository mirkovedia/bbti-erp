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
