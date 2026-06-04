'use client';

import { useState } from 'react';
import { DollarSign, Calendar, AlertTriangle, Lock, PlusCircle, Save, PieChart, BarChart3 } from 'lucide-react';
import { Proyecto } from '@/types';
import { useAppStore } from '@/store/appStore';
import { can } from '@/lib/auth/permissions';

interface Props {
  proyecto: Proyecto;
  onUpdate: (p: Proyecto) => void;
}

const fmt = (n: number) => `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const TabFinanzas = ({ proyecto, onUpdate }: Props) => {
  const { user } = useAppStore();
  const canEdit = can(user, 'canEditFinance');
  const canView = can(user, 'canViewFinance');

  // Datos derivados / bloqueados (vienen de Comercial y del proyecto)
  const montoTotal = proyecto.monto || 0;
  const adelantoInicial = proyecto.comercial?.adelanto || 0;
  const fechaPago = proyecto.comercial?.fecha_entrega || '';
  const pagos = proyecto.finanzas?.pagos || [];
  const pagosAdicionales = pagos.reduce((s, p) => s + (p.monto || 0), 0);
  const pagado = adelantoInicial + pagosAdicionales;
  const porCobrar = montoTotal - pagado;
  const pctPagado = montoTotal > 0 ? Math.round((pagado / montoTotal) * 100) : 0;
  const pctAvance = proyecto.produccion?.progreso || 0;

  const [pagoMonto, setPagoMonto] = useState(0);
  const [pagoFecha, setPagoFecha] = useState('');
  const [pagoNota, setPagoNota] = useState('');
  const [agregandoPago, setAgregandoPago] = useState(false);

  const refetch = async () => {
    const res = await fetch(`/api/proyectos/${proyecto.id}`);
    if (res.ok) onUpdate(await res.json());
  };

  if (!canView) {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="w-12 h-12 mx-auto mb-3 text-amber-400 opacity-50" />
        <p className="text-slate-400">No tienes permisos para ver información financiera.</p>
      </div>
    );
  }

  const handleAddPago = async () => {
    if (!pagoMonto) return;
    setAgregandoPago(true);
    try {
      const res = await fetch(`/api/proyectos/${proyecto.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addPago: { descripcion: pagoNota, monto: pagoMonto, fecha: pagoFecha || undefined } }),
      });
      if (res.ok) { setPagoMonto(0); setPagoFecha(''); setPagoNota(''); await refetch(); }
    } finally {
      setAgregandoPago(false);
    }
  };

  const resumen = [
    { label: 'Monto total', value: fmt(montoTotal), color: 'bg-blue-500/10 border-blue-500/30 text-blue-300' },
    { label: 'Adelanto inicial', value: fmt(adelantoInicial), color: 'bg-green-500/10 border-green-500/30 text-green-300' },
    { label: 'Pagos adicionales', value: fmt(pagosAdicionales), color: 'bg-violet-500/10 border-violet-500/30 text-violet-300' },
    { label: 'Por cobrar', value: fmt(porCobrar), color: 'bg-red-500/10 border-red-500/30 text-red-300' },
    { label: '% Avance prod.', value: `${pctAvance}%`, color: 'bg-amber-500/10 border-amber-500/30 text-amber-300' },
    { label: '% Pagado', value: `${pctPagado}%`, color: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* ───── Columna izquierda: registro ───── */}
      <div className="space-y-6">
        {/* Adelanto inicial (bloqueado, de Comercial) */}
        <div>
          <h3 className="text-sm font-semibold text-slate-400 uppercase mb-2 flex items-center gap-2">
            <DollarSign className="w-4 h-4" /> Adelanto inicial registrado por Comercial
          </h3>
          <div className="flex items-center gap-4 p-4 rounded-xl bg-green-500/10 border border-green-500/30">
            <div className="w-12 h-12 rounded-lg bg-green-500 flex items-center justify-center shrink-0">
              <DollarSign className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold text-green-300">{fmt(adelantoInicial)}</p>
              <p className="text-xs text-slate-400 flex items-center gap-1">
                <Lock className="w-3 h-3" /> Registrado por Comercial — no modificable en Finanzas
              </p>
            </div>
          </div>
        </div>

        {/* Pagos adicionales */}
        <div>
          <h3 className="text-sm font-semibold text-slate-400 uppercase mb-2 flex items-center gap-2">
            <PlusCircle className="w-4 h-4" /> Pagos adicionales registrados
          </h3>
          {pagos.length ? (
            <div className="space-y-2 mb-3">
              {pagos.map((p) => (
                <div key={p.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 border border-slate-700">
                  <div>
                    <p className="text-sm text-white">{p.descripcion || 'Pago'}</p>
                    <p className="text-xs text-slate-500">{p.fecha}</p>
                  </div>
                  <span className="text-sm font-medium text-green-300">{fmt(p.monto)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500 mb-3">Sin pagos adicionales.</p>
          )}

          {canEdit && (
            <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/20 space-y-2">
              <p className="text-sm font-medium text-blue-300 flex items-center gap-1">
                <PlusCircle className="w-4 h-4" /> Registrar nuevo pago
              </p>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number" min={0} value={pagoMonto || ''}
                  onChange={(e) => setPagoMonto(Number(e.target.value))}
                  placeholder="Monto S/"
                  className="px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="date" value={pagoFecha}
                  onChange={(e) => setPagoFecha(e.target.value)}
                  className="px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <input
                type="text" value={pagoNota}
                onChange={(e) => setPagoNota(e.target.value)}
                placeholder="Nota del pago (opcional)"
                className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleAddPago}
                disabled={agregandoPago || !pagoMonto}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
              >
                <Save className="w-4 h-4" /> {agregandoPago ? 'Registrando...' : 'Registrar pago'}
              </button>
            </div>
          )}
        </div>

        {/* Fecha estimada de pago total (bloqueada, de Comercial) */}
        <div>
          <h3 className="text-sm font-semibold text-slate-400 uppercase mb-2 flex items-center gap-2">
            <Calendar className="w-4 h-4" /> Fecha estimada de pago total
          </h3>
          <div className="flex items-center gap-4 p-4 rounded-xl bg-blue-500/10 border border-blue-500/30">
            <div className="w-12 h-12 rounded-lg bg-slate-900/60 flex items-center justify-center shrink-0">
              <Calendar className="w-6 h-6 text-blue-300" />
            </div>
            <div>
              <p className="text-2xl font-bold text-blue-200">{fechaPago || '—'}</p>
              <p className="text-xs text-slate-400 flex items-center gap-1">
                <Lock className="w-3 h-3" /> Definida por Comercial — no modificable en Finanzas
              </p>
            </div>
          </div>
        </div>

      </div>

      {/* ───── Columna derecha: visualización ───── */}
      <div className="space-y-6">
        {/* % Pagado (anillo) */}
        <div>
          <h3 className="text-sm font-semibold text-slate-400 uppercase mb-3 flex items-center gap-2">
            <PieChart className="w-4 h-4" /> Porcentaje pagado (automático)
          </h3>
          <div className="flex items-center gap-6 p-4 rounded-xl bg-[var(--navy)]/40 border border-slate-800">
            <div className="relative w-28 h-28 shrink-0">
              <div
                className="w-28 h-28 rounded-full"
                style={{ background: `conic-gradient(#06b6d4 0% ${pctPagado}%, #1e293b ${pctPagado}% 100%)` }}
              />
              <div className="absolute inset-[10px] rounded-full bg-[var(--navy2)] flex items-center justify-center">
                <span className="text-2xl font-bold text-cyan-400">{pctPagado}%</span>
              </div>
            </div>
            <div className="space-y-1 text-sm">
              <p className="text-slate-400">del total del proyecto</p>
              <p className="text-slate-300">Total: <span className="text-white">{fmt(montoTotal)}</span></p>
              <p className="text-slate-300">Pagado: <span className="text-green-400">{fmt(pagado)}</span></p>
              <p className="text-slate-300">Pendiente: <span className="text-red-400">{fmt(porCobrar)}</span></p>
            </div>
          </div>
        </div>

        {/* Resumen financiero */}
        <div>
          <h3 className="text-sm font-semibold text-slate-400 uppercase mb-3 flex items-center gap-2">
            <BarChart3 className="w-4 h-4" /> Resumen financiero
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {resumen.map((r) => (
              <div key={r.label} className={`p-4 rounded-xl border ${r.color}`}>
                <p className="text-xs uppercase opacity-70">{r.label}</p>
                <p className="text-xl font-bold mt-1">{r.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
