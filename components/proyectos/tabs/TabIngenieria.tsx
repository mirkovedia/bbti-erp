'use client';

import { useState, useRef } from 'react';
import { AlertCircle, Upload, Download, Trash2, File, Loader2 } from 'lucide-react';
import { Proyecto, Documento, Rol } from '@/types';
import { useAppStore } from '@/store/appStore';
import { can } from '@/lib/auth/permissions';
import { RoleBadge } from '@/components/shared/RoleBadge';
import { createClient } from '@/lib/supabase/client';
import { DOCUMENTOS_BUCKET, MAX_FILE_SIZE, ESTADOS_PLANO } from '@/lib/constants';
import { cn } from '@/lib/utils';

interface Props {
  proyecto: Proyecto;
  onUpdate: (p: Proyecto) => void;
}

// Color del estado de cada documento (versión de plano)
const estadoColor = (estado: string | null): string => {
  if (!estado) return 'border-slate-700 text-slate-400';
  if (/aprobad/i.test(estado)) return 'border-green-500/40 text-green-300 bg-green-500/10';
  if (/enviad/i.test(estado)) return 'border-blue-500/40 text-blue-300 bg-blue-500/10';
  if (/proceso/i.test(estado)) return 'border-amber-500/40 text-amber-300 bg-amber-500/10';
  return 'border-slate-600 text-slate-300 bg-slate-700/30';
};

// Color de cada opción del desplegable (legible sobre el fondo oscuro nativo)
const optionColor = (estado: string): string => {
  if (!estado) return '#94a3b8'; // slate-400
  if (/aprobad/i.test(estado)) return '#4ade80'; // green-400
  if (/enviad/i.test(estado)) return '#60a5fa'; // blue-400
  if (/proceso/i.test(estado)) return '#fbbf24'; // amber-400
  return '#cbd5e1'; // slate-300
};

export const TabIngenieria = ({ proyecto, onUpdate }: Props) => {
  const { user } = useAppStore();
  const canEdit = can(user, 'canEditIngenieria');
  const ingenieria = proyecto.ingenieria;

  const [nuevaObs, setNuevaObs] = useState('');
  const [enviando, setEnviando] = useState(false);

  const refetch = async () => {
    const res = await fetch(`/api/proyectos/${proyecto.id}`);
    if (res.ok) onUpdate(await res.json());
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
      if (res.ok) { setNuevaObs(''); await refetch(); }
    } finally {
      setEnviando(false);
    }
  };

  // ---- Documentos (versiones de planos, cada uno con su estado) ----
  const documentos: Documento[] = proyecto.documentos || [];
  const canDelete = user?.rol === 'Administrador';
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [savingEstado, setSavingEstado] = useState<string | null>(null);

  const handleUpload = async (file: File) => {
    setUploadError('');
    if (file.size > MAX_FILE_SIZE) {
      setUploadError('El archivo supera el límite de 25MB.');
      return;
    }
    setUploading(true);
    try {
      const urlRes = await fetch('/api/documentos/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proyecto_id: proyecto.id, filename: file.name }),
      });
      if (!urlRes.ok) throw new Error('No se pudo iniciar la subida');
      const { path, token } = await urlRes.json();

      const supabase = createClient();
      const { error: upErr } = await supabase.storage.from(DOCUMENTOS_BUCKET).uploadToSignedUrl(path, token, file);
      if (upErr) throw new Error(upErr.message);

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
    if (res.ok) { const { url } = await res.json(); window.open(url, '_blank'); }
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

  // Cambiar el estado de un documento (versión de plano) → recalcula el flujo
  const handleDocEstado = async (id: string, estado: string) => {
    setSavingEstado(id);
    try {
      const res = await fetch(`/api/proyectos/${proyecto.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updateDocumento: { id, estado: estado || null } }),
      });
      if (res.ok) await refetch();
    } finally {
      setSavingEstado(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Planos / Documentos con su estado */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <File className="w-5 h-5 text-blue-400" />
            Planos y documentos ({documentos.length})
          </h3>
          <p className="text-xs text-slate-500">El flujo avanza cuando un documento está &quot;Aprobados y firmados&quot;.</p>
        </div>

        <div className="space-y-2 mb-4">
          {documentos.length ? (
            documentos.map((doc) => (
              <div key={doc.id} className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                <File className="w-5 h-5 text-slate-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{doc.nombre}</p>
                  <div className="text-xs text-slate-500 flex items-center gap-1.5 flex-wrap mt-0.5">
                    <span>{doc.subido_por ?? '—'}</span>
                    {doc.subido_por_rol && <RoleBadge rol={doc.subido_por_rol as Rol} />}
                    {doc.created_at && <span>· {new Date(doc.created_at).toLocaleDateString('es-PE')}</span>}
                  </div>
                </div>

                {/* Estado del documento (versión) */}
                {canEdit ? (
                  <select
                    value={doc.estado ?? ''}
                    onChange={(e) => handleDocEstado(doc.id, e.target.value)}
                    disabled={savingEstado === doc.id}
                    className={cn(
                      'px-2 py-1 text-xs rounded-lg border bg-slate-800 focus:ring-2 focus:ring-blue-500 disabled:opacity-50',
                      estadoColor(doc.estado)
                    )}
                  >
                    <option value="" style={{ color: optionColor(''), backgroundColor: '#0b1225' }}>Sin estado</option>
                    {ESTADOS_PLANO.map((e) => (
                      <option key={e} value={e} style={{ color: optionColor(e), backgroundColor: '#0b1225' }}>{e}</option>
                    ))}
                  </select>
                ) : (
                  <span className={cn('px-2 py-0.5 text-xs rounded-full border', estadoColor(doc.estado))}>
                    {doc.estado ?? 'Sin estado'}
                  </span>
                )}

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
            <p className="text-sm text-slate-500">No hay planos ni documentos subidos.</p>
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
          {uploading ? 'Subiendo...' : 'Subir plano / documento'}
        </button>
        {uploadError && <p className="text-sm text-red-400 mt-2">{uploadError}</p>}
      </div>

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
