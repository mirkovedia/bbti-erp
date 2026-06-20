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
                  label={(props) => {
                    const { cantidad } = props as unknown as { cantidad?: number };
                    return cantidad != null ? String(cantidad) : '';
                  }}
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
