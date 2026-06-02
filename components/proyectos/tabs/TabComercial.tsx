'use client';

import { useState, useEffect } from 'react';
import { Calendar, DollarSign, FileText, MessageSquare, Save } from 'lucide-react';
import { Proyecto } from '@/types';
import { useAppStore } from '@/store/appStore';
import { can } from '@/lib/auth/permissions';

interface Props {
  proyecto: Proyecto;
  onUpdate: (p: Proyecto) => void;
}

export const TabComercial = ({ proyecto, onUpdate }: Props) => {
  const { user } = useAppStore();
  const canEdit = can(user, 'canEditComercial');
  const comercial = proyecto.comercial;

  const [fechaEntrega, setFechaEntrega] = useState(comercial?.fecha_entrega || '');
  const [diasPlazo, setDiasPlazo] = useState(comercial?.dias_plazo || 0);
  const [adelanto, setAdelanto] = useState(comercial?.adelanto || 0);
  const [metrado, setMetrado] = useState(comercial?.metrado || '');
  const [alerta, setAlerta] = useState(comercial?.alerta || '');
  const [saving, setSaving] = useState(false);
  const [nuevoComentario, setNuevoComentario] = useState('');
  const [enviando, setEnviando] = useState(false);

  // Re-sincroniza los campos si cambia el proyecto mostrado
  useEffect(() => {
    setFechaEntrega(comercial?.fecha_entrega || '');
    setDiasPlazo(comercial?.dias_plazo || 0);
    setAdelanto(comercial?.adelanto || 0);
    setMetrado(comercial?.metrado || '');
    setAlerta(comercial?.alerta || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proyecto.id]);

  const refetch = async () => {
    const res = await fetch(`/api/proyectos/${proyecto.id}`);
    if (res.ok) onUpdate(await res.json());
  };

  const handleComentario = async () => {
    const texto = nuevoComentario.trim();
    if (!texto) return;
    setEnviando(true);
    try {
      const res = await fetch(`/api/proyectos/${proyecto.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addComentario: { texto } }),
      });
      if (res.ok) {
        setNuevoComentario('');
        await refetch();
      }
    } finally {
      setEnviando(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/proyectos/${proyecto.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          comercial: { fecha_entrega: fechaEntrega, dias_plazo: diasPlazo, adelanto, metrado, alerta },
        }),
      });
      if (res.ok) {
        onUpdate({
          ...proyecto,
          comercial: { ...proyecto.comercial!, fecha_entrega: fechaEntrega, dias_plazo: diasPlazo, adelanto, adelanto_fijado: proyecto.comercial?.adelanto_fijado || false, metrado, alerta, comentarios: proyecto.comercial?.comentarios || [] },
        });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Info grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-400 mb-1.5">
            <Calendar className="w-4 h-4 inline mr-1" />
            Fecha de Entrega
          </label>
          <input
            type="date"
            value={fechaEntrega}
            onChange={(e) => setFechaEntrega(e.target.value)}
            disabled={!canEdit}
            className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white disabled:opacity-50 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-400 mb-1.5">
            Días de Plazo
          </label>
          <input
            type="number"
            value={diasPlazo}
            onChange={(e) => setDiasPlazo(Number(e.target.value))}
            disabled={!canEdit}
            className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white disabled:opacity-50 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

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
            className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white disabled:opacity-50 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-400 mb-1.5">
            <FileText className="w-4 h-4 inline mr-1" />
            Metrado
          </label>
          <input
            type="text"
            value={metrado}
            onChange={(e) => setMetrado(e.target.value)}
            disabled={!canEdit}
            placeholder="Descripción del metrado..."
            className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white disabled:opacity-50 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-slate-400 mb-1.5">
            Alerta
          </label>
          <input
            type="text"
            value={alerta}
            onChange={(e) => setAlerta(e.target.value)}
            disabled={!canEdit}
            placeholder="Nota de alerta..."
            className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white disabled:opacity-50 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Save button */}
      {canEdit && (
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Guardando...' : 'Guardar Cambios'}
        </button>
      )}

      {/* Comentarios */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-blue-400" />
          Comentarios
        </h3>

        <div className="space-y-3 max-h-64 overflow-y-auto mb-4">
          {comercial?.comentarios?.length ? (
            comercial.comentarios.map((c) => (
              <div key={c.id} className="p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-blue-300">{c.autor}</span>
                  <span className="text-xs text-slate-500">{c.fecha}</span>
                </div>
                <p className="text-sm text-slate-300">{c.texto}</p>
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-500">No hay comentarios aún.</p>
          )}
        </div>

        {canEdit && (
          <div className="flex gap-2">
            <input
              type="text"
              value={nuevoComentario}
              onChange={(e) => setNuevoComentario(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleComentario(); }}
              placeholder="Agregar comentario..."
              className="flex-1 px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              onClick={handleComentario}
              disabled={enviando || !nuevoComentario.trim()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {enviando ? 'Enviando...' : 'Enviar'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
