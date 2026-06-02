'use client';

import { useState, useEffect } from 'react';
import { Save, DollarSign, Calendar, AlertTriangle } from 'lucide-react';
import { Proyecto } from '@/types';
import { useAppStore } from '@/store/appStore';
import { can } from '@/lib/auth/permissions';

interface Props {
  proyecto: Proyecto;
  onUpdate: (p: Proyecto) => void;
}

export const TabFinanzas = ({ proyecto, onUpdate }: Props) => {
  const { user } = useAppStore();
  const canEdit = can(user, 'canEditFinance');
  const canView = can(user, 'canViewFinance');
  const finanzas = proyecto.finanzas;

  const [adelanto, setAdelanto] = useState(finanzas?.adelanto || 0);
  const [fechaAdelanto, setFechaAdelanto] = useState(finanzas?.fecha_adelanto || '');
  const [porcentaje, setPorcentaje] = useState(finanzas?.porcentaje || 0);
  const [formaPago, setFormaPago] = useState(finanzas?.forma_pago || '');
  const [alerta, setAlerta] = useState(finanzas?.alerta || '');
  const [saving, setSaving] = useState(false);
  const [pagoDesc, setPagoDesc] = useState('');
  const [pagoMonto, setPagoMonto] = useState(0);
  const [pagoFecha, setPagoFecha] = useState('');
  const [agregandoPago, setAgregandoPago] = useState(false);

  useEffect(() => {
    setAdelanto(finanzas?.adelanto || 0);
    setFechaAdelanto(finanzas?.fecha_adelanto || '');
    setPorcentaje(finanzas?.porcentaje || 0);
    setFormaPago(finanzas?.forma_pago || '');
    setAlerta(finanzas?.alerta || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proyecto.id]);

  const refetch = async () => {
    const res = await fetch(`/api/proyectos/${proyecto.id}`);
    if (res.ok) onUpdate(await res.json());
  };

  const handleAddPago = async () => {
    if (!pagoMonto) return;
    setAgregandoPago(true);
    try {
      const res = await fetch(`/api/proyectos/${proyecto.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addPago: { descripcion: pagoDesc, monto: pagoMonto, fecha: pagoFecha || undefined } }),
      });
      if (res.ok) {
        setPagoDesc('');
        setPagoMonto(0);
        setPagoFecha('');
        await refetch();
      }
    } finally {
      setAgregandoPago(false);
    }
  };

  if (!canView) {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="w-12 h-12 mx-auto mb-3 text-amber-400 opacity-50" />
        <p className="text-slate-400">No tienes permisos para ver información financiera.</p>
      </div>
    );
  }

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/proyectos/${proyecto.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          finanzas: { adelanto, fecha_adelanto: fechaAdelanto, porcentaje, forma_pago: formaPago, alerta },
        }),
      });
      if (res.ok) await refetch();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-400 mb-1.5">
            <DollarSign className="w-4 h-4 inline mr-1" />
            Adelanto (S/)
          </label>
          <input
            type="number"
            value={adelanto}
            onChange={(e) => setAdelanto(Number(e.target.value))}
            disabled={!canEdit}
            className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white disabled:opacity-50 focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-400 mb-1.5">
            <Calendar className="w-4 h-4 inline mr-1" />
            Fecha de Adelanto
          </label>
          <input
            type="date"
            value={fechaAdelanto}
            onChange={(e) => setFechaAdelanto(e.target.value)}
            disabled={!canEdit}
            className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white disabled:opacity-50 focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-400 mb-1.5">
            Porcentaje Pagado (%)
          </label>
          <input
            type="number"
            min={0}
            max={100}
            value={porcentaje}
            onChange={(e) => setPorcentaje(Number(e.target.value))}
            disabled={!canEdit}
            className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white disabled:opacity-50 focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-400 mb-1.5">
            Forma de Pago
          </label>
          <input
            type="text"
            value={formaPago}
            onChange={(e) => setFormaPago(e.target.value)}
            disabled={!canEdit}
            placeholder="Transferencia, cheque, etc."
            className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white disabled:opacity-50 focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-slate-400 mb-1.5">
            Alerta Financiera
          </label>
          <input
            type="text"
            value={alerta}
            onChange={(e) => setAlerta(e.target.value)}
            disabled={!canEdit}
            placeholder="Nota de alerta financiera..."
            className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white disabled:opacity-50 focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {canEdit && (
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
      )}

      {/* Pagos adicionales */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-3">Pagos Adicionales</h3>
        {finanzas?.pagos?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-2 px-3 text-xs font-medium text-slate-400 uppercase">Descripción</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-slate-400 uppercase">Monto</th>
                  <th className="text-center py-2 px-3 text-xs font-medium text-slate-400 uppercase">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {finanzas.pagos.map((p) => (
                  <tr key={p.id} className="border-b border-slate-800">
                    <td className="py-2 px-3 text-sm text-white">{p.descripcion}</td>
                    <td className="py-2 px-3 text-sm text-right text-green-300">S/ {p.monto.toLocaleString()}</td>
                    <td className="py-2 px-3 text-sm text-center text-slate-400">{p.fecha}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-500">No hay pagos adicionales registrados.</p>
        )}

        {canEdit && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-2">
            <input
              type="text"
              value={pagoDesc}
              onChange={(e) => setPagoDesc(e.target.value)}
              placeholder="Descripción"
              className="md:col-span-2 px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="number"
              value={pagoMonto || ''}
              onChange={(e) => setPagoMonto(Number(e.target.value))}
              placeholder="Monto (S/)"
              className="px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="date"
              value={pagoFecha}
              onChange={(e) => setPagoFecha(e.target.value)}
              className="px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleAddPago}
              disabled={agregandoPago || !pagoMonto}
              className="md:col-span-4 px-4 py-2 bg-green-600 hover:bg-green-500 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
            >
              {agregandoPago ? 'Agregando...' : 'Agregar Pago'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
