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
