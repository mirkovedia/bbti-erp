'use client';

import { useState } from 'react';
import { Plus, Package, Trash2, Save } from 'lucide-react';
import { Proyecto, Material, EstadoMaterial } from '@/types';
import { useAppStore } from '@/store/appStore';
import { can } from '@/lib/auth/permissions';
import { cn } from '@/lib/utils';

interface Props {
  proyecto: Proyecto;
  onUpdate: (p: Proyecto) => void;
}

const estadoColors: Record<EstadoMaterial, string> = {
  COMPLETO: 'bg-green-500/20 text-green-300 border-green-500/30',
  PARCIAL: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  PENDIENTE: 'bg-red-500/20 text-red-300 border-red-500/30',
};

// Deriva el estado del material según lo comprado vs. la cantidad requerida
const calcEstado = (cantidad: number, comprado: number): EstadoMaterial => {
  if (comprado <= 0) return 'PENDIENTE';
  if (comprado >= cantidad) return 'COMPLETO';
  return 'PARCIAL';
};

export const TabLogistica = ({ proyecto, onUpdate }: Props) => {
  const { user } = useAppStore();
  const canEdit = can(user, 'canEditLogistica');

  const [materiales, setMateriales] = useState<Material[]>(
    proyecto.logistica?.materiales || []
  );
  const [saving, setSaving] = useState(false);
  const [nuevo, setNuevo] = useState({ nombre: '', cantidad: 0, unidad: 'und', comprado: 0 });

  const dirty = JSON.stringify(materiales) !== JSON.stringify(proyecto.logistica?.materiales || []);

  const addMaterial = () => {
    if (!nuevo.nombre.trim()) return;
    const material: Material = {
      id: `tmp-${Date.now()}`,
      nombre: nuevo.nombre.trim(),
      cantidad: nuevo.cantidad,
      unidad: nuevo.unidad || 'und',
      comprado: nuevo.comprado,
      estado: calcEstado(nuevo.cantidad, nuevo.comprado),
    };
    setMateriales((prev) => [...prev, material]);
    setNuevo({ nombre: '', cantidad: 0, unidad: 'und', comprado: 0 });
  };

  const updateComprado = (id: string, comprado: number) => {
    setMateriales((prev) =>
      prev.map((m) =>
        m.id === id ? { ...m, comprado, estado: calcEstado(m.cantidad, comprado) } : m
      )
    );
  };

  const removeMaterial = (id: string) => {
    setMateriales((prev) => prev.filter((m) => m.id !== id));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/proyectos/${proyecto.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ materiales }),
      });
      if (res.ok) {
        const refetch = await fetch(`/api/proyectos/${proyecto.id}`);
        if (refetch.ok) {
          const data = await refetch.json();
          setMateriales(data.logistica?.materiales || []);
          onUpdate(data);
        }
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <Package className="w-5 h-5 text-green-400" />
          Materiales ({materiales.length})
        </h3>
        {canEdit && dirty && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        )}
      </div>

      {materiales.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left py-3 px-4 text-xs font-medium text-slate-400 uppercase">Material</th>
                <th className="text-center py-3 px-4 text-xs font-medium text-slate-400 uppercase">Cantidad</th>
                <th className="text-center py-3 px-4 text-xs font-medium text-slate-400 uppercase">Unidad</th>
                <th className="text-center py-3 px-4 text-xs font-medium text-slate-400 uppercase">Comprado</th>
                <th className="text-center py-3 px-4 text-xs font-medium text-slate-400 uppercase">Estado</th>
                {canEdit && <th className="text-center py-3 px-4 text-xs font-medium text-slate-400 uppercase">Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {materiales.map((m) => (
                <tr key={m.id} className="border-b border-slate-800 hover:bg-slate-800/30">
                  <td className="py-3 px-4 text-sm text-white">{m.nombre}</td>
                  <td className="py-3 px-4 text-sm text-center text-slate-300">{m.cantidad}</td>
                  <td className="py-3 px-4 text-sm text-center text-slate-300">{m.unidad}</td>
                  <td className="py-3 px-4 text-sm text-center text-slate-300">
                    {canEdit ? (
                      <input
                        type="number"
                        min={0}
                        value={m.comprado}
                        onChange={(e) => updateComprado(m.id, Number(e.target.value))}
                        className="w-20 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-white text-center text-sm focus:ring-2 focus:ring-blue-500"
                      />
                    ) : (
                      m.comprado
                    )}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className={cn('inline-flex px-2 py-0.5 rounded-full text-xs font-medium border', estadoColors[m.estado])}>
                      {m.estado}
                    </span>
                  </td>
                  {canEdit && (
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => removeMaterial(m.id)}
                        className="p-1 text-slate-400 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-12 text-slate-500">
          <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No hay materiales registrados</p>
        </div>
      )}

      {canEdit && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2 pt-4 border-t border-slate-800">
          <input
            type="text"
            value={nuevo.nombre}
            onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })}
            placeholder="Nombre del material"
            className="md:col-span-2 px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="number"
            min={0}
            value={nuevo.cantidad || ''}
            onChange={(e) => setNuevo({ ...nuevo, cantidad: Number(e.target.value) })}
            placeholder="Cantidad"
            className="px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="text"
            value={nuevo.unidad}
            onChange={(e) => setNuevo({ ...nuevo, unidad: e.target.value })}
            placeholder="Unidad"
            className="px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={addMaterial}
            disabled={!nuevo.nombre.trim()}
            className="flex items-center justify-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-500 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            Agregar
          </button>
        </div>
      )}
    </div>
  );
};
