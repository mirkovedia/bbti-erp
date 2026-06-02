'use client';

import { useState, useEffect, useRef } from 'react';
import { Save, FileCheck, AlertCircle, Upload, Download, Trash2, File, Loader2 } from 'lucide-react';
import { Proyecto, Documento } from '@/types';
import { useAppStore } from '@/store/appStore';
import { can } from '@/lib/auth/permissions';
import { createClient } from '@/lib/supabase/client';
import { DOCUMENTOS_BUCKET, MAX_FILE_SIZE } from '@/lib/constants';

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

  // ---- Documentos ----
  const documentos: Documento[] = proyecto.documentos || [];
  const canDelete = user?.rol === 'Administrador';
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleUpload = async (file: File) => {
    setUploadError('');
    if (file.size > MAX_FILE_SIZE) {
      setUploadError('El archivo supera el límite de 25MB.');
      return;
    }
    setUploading(true);
    try {
      // 1) Pedir URL de subida firmada
      const urlRes = await fetch('/api/documentos/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proyecto_id: proyecto.id, filename: file.name }),
      });
      if (!urlRes.ok) throw new Error('No se pudo iniciar la subida');
      const { path, token } = await urlRes.json();

      // 2) Subir el archivo directo al Storage
      const supabase = createClient();
      const { error: upErr } = await supabase.storage
        .from(DOCUMENTOS_BUCKET)
        .uploadToSignedUrl(path, token, file);
      if (upErr) throw new Error(upErr.message);

      // 3) Registrar metadatos
      const tipo = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : null;
      const metaRes = await fetch('/api/documentos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proyecto_id: proyecto.id, nombre: file.name, tipo, storage_path: path }),
      });
      if (!metaRes.ok) throw new Error('No se pudo registrar el documento');

      await refetch();
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Error al subir');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDownload = async (doc: Documento) => {
    if (!doc.storage_path) return;
    const res = await fetch('/api/documentos/download-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storage_path: doc.storage_path }),
    });
    if (res.ok) {
      const { url } = await res.json();
      window.open(url, '_blank');
    }
  };

  const handleDeleteDoc = async (id: string) => {
    if (!window.confirm('¿Eliminar este documento? Esta acción no se puede deshacer.')) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/documentos/${id}`, { method: 'DELETE' });
      if (res.ok) await refetch();
    } finally {
      setDeletingId(null);
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

      {/* Documentos */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
          <File className="w-5 h-5 text-blue-400" />
          Documentos ({documentos.length})
        </h3>

        <div className="space-y-2 mb-4">
          {documentos.length ? (
            documentos.map((doc) => (
              <div key={doc.id} className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                <File className="w-5 h-5 text-slate-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{doc.nombre}</p>
                  <p className="text-xs text-slate-500">
                    {doc.subido_por ?? '—'}
                    {doc.created_at ? ` · ${new Date(doc.created_at).toLocaleDateString('es-PE')}` : ''}
                  </p>
                </div>
                <button
                  onClick={() => handleDownload(doc)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                  title="Descargar"
                >
                  <Download className="w-4 h-4" />
                </button>
                {canDelete && (
                  <button
                    onClick={() => handleDeleteDoc(doc.id)}
                    disabled={deletingId === doc.id}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                    title="Eliminar"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-500">No hay documentos subidos.</p>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50"
        >
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {uploading ? 'Subiendo...' : 'Subir documento'}
        </button>
        {uploadError && <p className="text-sm text-red-400 mt-2">{uploadError}</p>}
      </div>
    </div>
  );
};
