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
                  formatter={(value) => fm(Number(value) || 0)}
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
