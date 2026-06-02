'use client';

import { useState, useEffect } from 'react';
import { Save, FileCheck, AlertCircle } from 'lucide-react';
import { Proyecto } from '@/types';
import { useAppStore } from '@/store/appStore';
import { can } from '@/lib/auth/permissions';

interface Props {
  proyecto: Proyecto;
  onUpdate: (p: Proyecto) => void;
}

const estadosPlanos = [
  'Solicitud de planos',
  'En elaboración',
  'En revisión',
  'Aprobados',
  'Entregados a producción',
];

export const TabIngenieria = ({ proyecto, onUpdate }: Props) => {
  const { user } = useAppStore();
  const canEdit = can(user, 'canEditIngenieria');
  const ingenieria = proyecto.ingenieria;

  const [estadoPlanos, setEstadoPlanos] = useState(ingenieria?.estado_planos || 'Solicitud de planos');
  const [saving, setSaving] = useState(false);
  const [nuevaObs, setNuevaObs] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    setEstadoPlanos(ingenieria?.estado_planos || 'Solicitud de planos');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proyecto.id]);

  const refetch = async () => {
    const res = await fetch(`/api/proyectos/${proyecto.id}`);
    if (res.ok) onUpdate(await res.json());
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/proyectos/${proyecto.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ingenieria: { estado_planos: estadoPlanos } }),
      });
      if (res.ok) {
        onUpdate({
          ...proyecto,
          ingenieria: { ...proyecto.ingenieria!, estado_planos: estadoPlanos },
        });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleObservacion = async () => {
    const texto = nuevaObs.trim();
    if (!texto) return;
    setEnviando(true);
    try {
      const res = await fetch(`/api/proyectos/${proyecto.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addObservacion: { texto } }),
      });
      if (res.ok) {
        setNuevaObs('');
        await refetch();
      }
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-400 mb-1.5">
            <FileCheck className="w-4 h-4 inline mr-1" />
            Estado de Planos
          </label>
          <select
            value={estadoPlanos}
            onChange={(e) => setEstadoPlanos(e.target.value)}
            disabled={!canEdit}
            className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white disabled:opacity-50 focus:ring-2 focus:ring-blue-500"
          >
            {estadosPlanos.map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
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

      {/* Observaciones */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-cyan-400" />
          Observaciones
        </h3>

        <div className="space-y-3 max-h-64 overflow-y-auto mb-4">
          {ingenieria?.observaciones?.length ? (
            ingenieria.observaciones.map((o) => (
              <div key={o.id} className="p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-cyan-300">{o.autor}</span>
                  <span className="text-xs text-slate-500">{o.fecha}</span>
                </div>
                <p className="text-sm text-slate-300">{o.texto}</p>
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-500">No hay observaciones.</p>
          )}
        </div>

        {canEdit && (
          <div className="flex gap-2">
            <input
              type="text"
              value={nuevaObs}
              onChange={(e) => setNuevaObs(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleObservacion(); }}
              placeholder="Agregar observación..."
              className="flex-1 px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleObservacion}
              disabled={enviando || !nuevaObs.trim()}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {enviando ? 'Agregando...' : 'Agregar'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
