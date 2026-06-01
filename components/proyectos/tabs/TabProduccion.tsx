'use client';

import { useState } from 'react';
import { Save, CheckCircle2, Circle, Loader2 } from 'lucide-react';
import { Proyecto, EstadoEtapa } from '@/types';
import { useAppStore } from '@/store/appStore';
import { can } from '@/lib/auth/permissions';
import { ProgressBar } from '@/components/shared/ProgressBar';
import { cn } from '@/lib/utils';

interface Props {
  proyecto: Proyecto;
  onUpdate: (p: Proyecto) => void;
}

const etapaIcons: Record<EstadoEtapa, typeof CheckCircle2> = {
  COMPLETADO: CheckCircle2,
  'EN PROCESO': Loader2,
  PENDIENTE: Circle,
};

const etapaColors: Record<EstadoEtapa, string> = {
  COMPLETADO: 'text-green-400',
  'EN PROCESO': 'text-blue-400',
  PENDIENTE: 'text-slate-500',
};

export const TabProduccion = ({ proyecto, onUpdate }: Props) => {
  const { user } = useAppStore();
  const canEdit = can(user, 'canEditProduccion');
  const produccion = proyecto.produccion;
  const etapas = produccion?.etapas || [];

  const progreso = etapas.length > 0
    ? Math.round((etapas.filter(e => e.estado === 'COMPLETADO').length / etapas.length) * 100)
    : produccion?.progreso || 0;

  const [pruebas, setPruebas] = useState(produccion?.pruebas || false);
  const [envio, setEnvio] = useState(produccion?.envio || false);
  const [saving, setSaving] = useState(false);
  const [updatingEtapa, setUpdatingEtapa] = useState<string | null>(null);

  const refetch = async () => {
    const res = await fetch(`/api/proyectos/${proyecto.id}`);
    if (res.ok) onUpdate(await res.json());
  };

  const handleEtapaChange = async (etapaId: string, estado: EstadoEtapa) => {
    setUpdatingEtapa(etapaId);
    try {
      const res = await fetch(`/api/proyectos/${proyecto.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ etapas: [{ id: etapaId, estado }] }),
      });
      if (res.ok) await refetch();
    } finally {
      setUpdatingEtapa(null);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/proyectos/${proyecto.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ produccion: { progreso, pruebas, envio } }),
      });
      if (res.ok) await refetch();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Progress overview */}
      <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-700">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-slate-300">Progreso General</span>
          <span className="text-2xl font-bold text-white">{progreso}%</span>
        </div>
        <ProgressBar value={progreso} showLabel={false} />
      </div>

      {/* Etapas */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-4">Etapas de Producción</h3>
        <div className="space-y-2">
          {etapas.map((etapa) => {
            const Icon = etapaIcons[etapa.estado];
            return (
              <div
                key={etapa.id}
                className="flex items-center gap-3 p-3 bg-slate-800/30 rounded-lg border border-slate-700"
              >
                <Icon className={cn('w-5 h-5', etapaColors[etapa.estado])} />
                <span className="flex-1 text-sm text-white">{etapa.nombre}</span>
                {canEdit && (
                  <select
                    value={etapa.estado}
                    onChange={(e) => handleEtapaChange(etapa.id, e.target.value as EstadoEtapa)}
                    disabled={updatingEtapa === etapa.id}
                    className="px-2 py-1 text-xs bg-slate-800 border border-slate-600 rounded text-white disabled:opacity-50"
                  >
                    <option value="PENDIENTE">Pendiente</option>
                    <option value="EN PROCESO">En Proceso</option>
                    <option value="COMPLETADO">Completado</option>
                  </select>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Checkboxes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="flex items-center gap-3 p-3 bg-slate-800/30 rounded-lg border border-slate-700 cursor-pointer">
          <input
            type="checkbox"
            checked={pruebas}
            onChange={(e) => setPruebas(e.target.checked)}
            disabled={!canEdit}
            className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500"
          />
          <span className="text-sm text-white">Pruebas completadas</span>
        </label>

        <label className="flex items-center gap-3 p-3 bg-slate-800/30 rounded-lg border border-slate-700 cursor-pointer">
          <input
            type="checkbox"
            checked={envio}
            onChange={(e) => setEnvio(e.target.checked)}
            disabled={!canEdit}
            className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500"
          />
          <span className="text-sm text-white">Listo para envío</span>
        </label>
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
    </div>
  );
};
