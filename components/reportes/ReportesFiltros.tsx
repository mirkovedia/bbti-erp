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
