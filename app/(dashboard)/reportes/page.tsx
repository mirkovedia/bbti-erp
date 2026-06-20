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
