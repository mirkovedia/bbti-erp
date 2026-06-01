'use client';

import { useEffect, useState } from 'react';
import {
  BarChart3,
  TrendingUp,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { Proyecto, EstadoProyecto } from '@/types';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { ExportMenu } from '@/components/shared/ExportMenu';
import { exportToExcel, exportToPDF } from '@/lib/utils/export';
import { fm, diasRestantes } from '@/lib/utils/format';

const ESTADO_COLORS: Record<EstadoProyecto, string> = {
  'EN PRODUCCIÓN': '#2563eb',
  'LISTO PARA PRUEBAS': '#f59e0b',
  'EN INGENIERÍA': '#06b6d4',
  'COMPRAS EN CURSO': '#8b5cf6',
  RETRASADO: '#f43f5e',
  COMPLETADO: '#10b981',
};

export default function ReportesPage() {
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/proyectos');
        const data = await res.json();
        setProyectos(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('Error fetching proyectos:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const total = proyectos.length;
  const montoTotal = proyectos.reduce((acc, p) => acc + (p.monto || 0), 0);
  const retrasados = proyectos.filter((p) => p.estado === 'RETRASADO').length;
  const completados = proyectos.filter((p) => p.estado === 'COMPLETADO').length;
  const tasaCompletado = total > 0 ? Math.round((completados / total) * 100) : 0;

  const estados: EstadoProyecto[] = [
    'EN INGENIERÍA',
    'COMPRAS EN CURSO',
    'EN PRODUCCIÓN',
    'LISTO PARA PRUEBAS',
    'RETRASADO',
    'COMPLETADO',
  ];

  const chartData = estados.map((estado) => ({
    estado: estado.length > 12 ? `${estado.slice(0, 11)}…` : estado,
    estadoFull: estado,
    cantidad: proyectos.filter((p) => p.estado === estado).length,
  }));

  // Órdenes por vencer en los próximos 7 días
  const porVencer = proyectos
    .map((p) => ({ p, dias: diasRestantes(p.comercial?.fecha_entrega) }))
    .filter(({ dias }) => dias !== null && dias >= 0 && dias <= 7)
    .sort((a, b) => (a.dias ?? 0) - (b.dias ?? 0));

  const kpis = [
    { label: 'Total Órdenes', value: String(total), icon: BarChart3, color: 'from-blue-600 to-blue-400' },
    { label: 'Monto Total', value: fm(montoTotal), icon: DollarSign, color: 'from-cyan-600 to-cyan-400' },
    { label: 'Retrasadas', value: String(retrasados), icon: AlertTriangle, color: 'from-red-600 to-red-400' },
    { label: 'Tasa Completado', value: `${tasaCompletado}%`, icon: CheckCircle2, color: 'from-green-600 to-green-400' },
  ];

  const handleExportExcel = () => {
    const rows = proyectos.map((p) => ({
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
    const rows = proyectos.map((p) => ({
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
        <ExportMenu onExportPDF={handleExportPDF} onExportExcel={handleExportExcel} disabled={total === 0} />
      </div>

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
              <p className={`text-2xl font-bold mt-2 bg-gradient-to-r bg-clip-text text-transparent ${kpi.color}`}>
                {kpi.value}
              </p>
            </div>
          );
        })}
      </div>

      {/* Gráfico por estado */}
      <div className="bg-[var(--navy2)] rounded-xl border border-slate-800 p-6">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-5 h-5 text-blue-400" />
          <h2 className="text-lg font-semibold text-white">Distribución por Estado</h2>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="estado" tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0b1225',
                  border: '1px solid #334155',
                  borderRadius: 8,
                  color: '#fff',
                }}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.estadoFull ?? ''}
              />
              <Bar dataKey="cantidad" radius={[6, 6, 0, 0]}>
                {chartData.map((entry) => (
                  <Cell key={entry.estadoFull} fill={ESTADO_COLORS[entry.estadoFull as EstadoProyecto]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Por vencer */}
      <div className="bg-[var(--navy2)] rounded-xl border border-slate-800 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Órdenes por vencer (próximos 7 días)</h2>
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
}
