'use client';

import { useState, useEffect, useRef } from 'react';
import { Calendar, DollarSign, FileText, MessageSquare, Save, FileSpreadsheet, Upload, X, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Proyecto } from '@/types';
import { useAppStore } from '@/store/appStore';
import { can } from '@/lib/auth/permissions';
import { parseMetrado, type MaterialParsed } from '@/lib/utils/parse-metrado';

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

  // ---- Importar metrado (Excel) ----
  const canImport = can(user, 'canEditLogistica');
  const metradoInputRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<MaterialParsed[] | null>(null);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [metradoFile, setMetradoFile] = useState('');
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState('');

  const handleMetradoFile = async (file: File) => {
    setImportMsg('');
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const { materiales, warnings } = parseMetrado(wb);
      setParsed(materiales);
      setParseWarnings(warnings);
      setMetradoFile(file.name);
    } catch {
      setParsed([]);
      setParseWarnings(['No se pudo leer el archivo. ¿Es un Excel válido?']);
      setMetradoFile(file.name);
    } finally {
      if (metradoInputRef.current) metradoInputRef.current.value = '';
    }
  };

  const handleConfirmImport = async () => {
    if (!parsed?.length) return;
    setImporting(true);
    setImportMsg('');
    try {
      const res = await fetch(`/api/proyectos/${proyecto.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ materiales: parsed, comercial: { metrado: metradoFile } }),
      });
      if (res.ok) {
        await refetch();
        setParsed(null);
        setImportMsg(`${parsed.length} materiales importados a Logística.`);
      } else {
        const body = await res.json().catch(() => ({}));
        setImportMsg(body.error || 'Error al importar.');
      }
    } finally {
      setImporting(false);
    }
  };

  const totalParsed = parsed?.reduce((s, m) => s + m.cantidad * (m.precio_unitario || 0), 0) ?? 0;

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
          <div className="flex gap-2">
            <input
              type="text"
              value={metrado}
              onChange={(e) => setMetrado(e.target.value)}
              disabled={!canEdit}
              placeholder="Descripción o archivo del metrado..."
              className="flex-1 px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white disabled:opacity-50 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {canImport && (
              <>
                <input
                  ref={metradoInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleMetradoFile(f); }}
                />
                <button
                  type="button"
                  onClick={() => metradoInputRef.current?.click()}
                  title="Importar materiales desde un Excel de metrado"
                  className="flex items-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-500 text-white text-sm rounded-lg transition-colors whitespace-nowrap"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  Importar metrado
                </button>
              </>
            )}
          </div>
          {importMsg && <p className="text-xs text-green-400 mt-1">{importMsg}</p>}
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

      {/* Modal vista previa del metrado importado */}
      {parsed !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-[var(--navy2)] rounded-xl border border-slate-700 w-full max-w-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-green-400" />
                Importar metrado
              </h2>
              <button onClick={() => setParsed(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto">
              {parseWarnings.length > 0 && (
                <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                  {parseWarnings.map((w, i) => (
                    <p key={i} className="text-sm text-amber-300">{w}</p>
                  ))}
                </div>
              )}

              {parsed.length > 0 ? (
                <>
                  <p className="text-sm text-slate-300 mb-1">
                    Archivo: <span className="text-white">{metradoFile}</span>
                  </p>
                  <p className="text-sm text-slate-300 mb-4">
                    Se detectaron <span className="text-green-400 font-semibold">{parsed.length} materiales</span>
                    {' · '}Total metrado: <span className="text-white">S/ {totalParsed.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</span>
                  </p>
                  <div className="overflow-x-auto rounded-lg border border-slate-800">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-700 bg-slate-800/50">
                          <th className="text-left py-2 px-3 text-xs font-medium text-slate-400 uppercase">Código</th>
                          <th className="text-left py-2 px-3 text-xs font-medium text-slate-400 uppercase">Material</th>
                          <th className="text-center py-2 px-3 text-xs font-medium text-slate-400 uppercase">Cant.</th>
                          <th className="text-right py-2 px-3 text-xs font-medium text-slate-400 uppercase">P. Unit.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsed.slice(0, 10).map((m, i) => (
                          <tr key={i} className="border-b border-slate-800/50">
                            <td className="py-1.5 px-3 text-blue-400 font-mono">{m.codigo}</td>
                            <td className="py-1.5 px-3 text-white">{m.nombre}</td>
                            <td className="py-1.5 px-3 text-center text-slate-300">{m.cantidad}</td>
                            <td className="py-1.5 px-3 text-right text-slate-300">S/ {(m.precio_unitario || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {parsed.length > 10 && (
                    <p className="text-xs text-slate-500 mt-2">… y {parsed.length - 10} materiales más.</p>
                  )}
                </>
              ) : (
                <p className="text-sm text-slate-400">No se encontraron materiales en el Excel.</p>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-800">
              <button
                onClick={() => setParsed(null)}
                className="px-4 py-2 bg-slate-800 border border-slate-700 hover:bg-slate-700 text-white rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmImport}
                disabled={importing || parsed.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {importing ? 'Importando...' : 'Importar a Logística (reemplaza)'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
