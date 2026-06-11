'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Download, Search, File, FileSpreadsheet, Upload, Trash2 } from 'lucide-react';
import type { Documento, DocumentoEvento, TipoEventoDoc, Rol } from '@/types';
import { RoleBadge } from '@/components/shared/RoleBadge';
import { fechaHora } from '@/lib/utils/format';
import { useDebounce } from '@/hooks/useDebounce';
import { cn } from '@/lib/utils';

// La lista global añade el nombre del cliente (join con proyectos)
interface DocumentoConCliente extends Documento {
  cliente: string;
}

const tipoIcon = (tipo: string | null) => {
  if (tipo === 'xlsx') return <FileSpreadsheet className="w-5 h-5 text-green-400" />;
  if (tipo === 'pdf') return <FileText className="w-5 h-5 text-red-400" />;
  return <File className="w-5 h-5 text-slate-400" />;
};

const eventoConfig: Record<TipoEventoDoc, { verbo: string; icon: typeof Upload; color: string }> = {
  subida: { verbo: 'subió', icon: Upload, color: 'text-green-400' },
  descarga: { verbo: 'descargó', icon: Download, color: 'text-blue-400' },
  eliminacion: { verbo: 'eliminó', icon: Trash2, color: 'text-red-400' },
};

export default function DocumentosPage() {
  const router = useRouter();
  const [view, setView] = useState<'documentos' | 'actividad'>('documentos');
  const [docs, setDocs] = useState<DocumentoConCliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [proyectoFilter, setProyectoFilter] = useState('');

  const [eventos, setEventos] = useState<DocumentoEvento[]>([]);
  const [loadingEv, setLoadingEv] = useState(false);
  const [eventosCargados, setEventosCargados] = useState(false);

  useEffect(() => {
    const fetchDocs = async () => {
      try {
        const res = await fetch('/api/documentos');
        const data = await res.json();
        setDocs(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('Error fetching documentos:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchDocs();
  }, []);

  const cargarActividad = useCallback(async () => {
    setLoadingEv(true);
    try {
      const res = await fetch('/api/documentos/eventos');
      const data = await res.json();
      setEventos(Array.isArray(data) ? data : []);
      setEventosCargados(true);
    } catch (err) {
      console.error('Error fetching eventos:', err);
    } finally {
      setLoadingEv(false);
    }
  }, []);

  const irActividad = () => {
    setView('actividad');
    if (!eventosCargados) cargarActividad();
  };

  const proyectos = useMemo(
    () => Array.from(new Set(docs.map((d) => d.proyecto_id))).sort(),
    [docs]
  );

  const debouncedSearch = useDebounce(search);
  const filtered = useMemo(() => {
    const q = debouncedSearch.toLowerCase();
    return docs.filter((d) => {
      const matchesSearch =
        (d.nombre ?? '').toLowerCase().includes(q) ||
        (d.cliente ?? '').toLowerCase().includes(q);
      const matchesProyecto = !proyectoFilter || d.proyecto_id === proyectoFilter;
      return matchesSearch && matchesProyecto;
    });
  }, [docs, debouncedSearch, proyectoFilter]);

  const handleDownload = async (doc: DocumentoConCliente) => {
    if (!doc.storage_path) return;
    try {
      const res = await fetch('/api/documentos/download-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storage_path: doc.storage_path }),
      });
      const data = await res.json();
      if (data.url) window.open(data.url, '_blank');
    } catch (err) {
      console.error('Error generando URL:', err);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Documentos</h1>
        <p className="text-slate-400 mt-1">{docs.length} archivos en todos los proyectos</p>
      </div>

      {/* Tabs: Documentos / Actividad */}
      <div className="border-b border-slate-800 overflow-x-auto scrollbar-none">
        <nav className="flex gap-1 min-w-max">
          <button
            onClick={() => setView('documentos')}
            className={cn(
              'px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors shrink-0',
              view === 'documentos'
                ? 'bg-slate-800 text-blue-400 border-b-2 border-blue-400'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            )}
          >
            Documentos
          </button>
          <button
            onClick={irActividad}
            className={cn(
              'px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors shrink-0',
              view === 'actividad'
                ? 'bg-slate-800 text-blue-400 border-b-2 border-blue-400'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            )}
          >
            Actividad
          </button>
        </nav>
      </div>

      {view === 'documentos' && (
        <>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre o cliente..."
                className="w-full pl-10 pr-4 py-2.5 bg-slate-800/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <select
              value={proyectoFilter}
              onChange={(e) => setProyectoFilter(e.target.value)}
              className="px-4 py-2.5 bg-slate-800/50 border border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todos los proyectos</option>
              {proyectos.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          <div className="bg-[var(--navy2)] rounded-xl border border-slate-800 overflow-hidden">
            {loading ? (
              <div className="p-8 text-center">
                <div className="inline-block w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-12 text-center">
                <FileText className="w-16 h-16 mx-auto mb-4 text-slate-600" />
                <p className="text-slate-400">No hay documentos para mostrar.</p>
                <p className="text-slate-500 text-sm mt-1">Los archivos se suben desde la pestaña Ingeniería de cada proyecto.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-800/50">
                {filtered.map((doc) => (
                  <div key={doc.id} className="flex items-center gap-4 p-4 hover:bg-slate-800/30 transition-colors">
                    {tipoIcon(doc.tipo)}
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">{doc.nombre}</p>
                      <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                        <button
                          onClick={() => router.push(`/proyectos/${doc.proyecto_id}`)}
                          className="text-blue-400 font-mono hover:underline"
                        >
                          {doc.proyecto_id}
                        </button>
                        <span>·</span>
                        <span>{doc.cliente}</span>
                        {doc.subido_por && <><span>·</span><span>{doc.subido_por}</span></>}
                        {doc.subido_por_rol && <RoleBadge rol={doc.subido_por_rol as Rol} />}
                      </div>
                    </div>
                    <span className="text-xs text-slate-500 shrink-0">
                      {fechaHora(doc.created_at)}
                    </span>
                    <button
                      onClick={() => handleDownload(doc)}
                      disabled={!doc.storage_path}
                      className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors disabled:opacity-30"
                      title="Descargar"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {view === 'actividad' && (
        <div className="bg-[var(--navy2)] rounded-xl border border-slate-800 overflow-hidden">
          {loadingEv ? (
            <div className="p-8 text-center">
              <div className="inline-block w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : eventos.length === 0 ? (
            <div className="p-12 text-center">
              <FileText className="w-16 h-16 mx-auto mb-4 text-slate-600" />
              <p className="text-slate-400">Aún no hay actividad registrada.</p>
              <p className="text-slate-500 text-sm mt-1">Aquí aparece quién sube, descarga o elimina cada documento.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-800/50">
              {eventos.map((ev) => {
                const cfg = eventoConfig[ev.tipo] ?? eventoConfig.descarga;
                const Icon = cfg.icon;
                return (
                  <div key={ev.id} className="flex items-center gap-4 p-4">
                    <Icon className={cn('w-5 h-5 shrink-0', cfg.color)} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white">
                        <span className="font-medium">{ev.usuario ?? 'Alguien'}</span>{' '}
                        <span className="text-slate-400">{cfg.verbo}</span>{' '}
                        <span className="font-medium">{ev.documento_nombre}</span>
                      </p>
                      <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                        {ev.proyecto_id && (
                          <button
                            onClick={() => router.push(`/proyectos/${ev.proyecto_id}`)}
                            className="text-blue-400 font-mono hover:underline"
                          >
                            {ev.proyecto_id}
                          </button>
                        )}
                        {ev.rol && <RoleBadge rol={ev.rol as Rol} />}
                      </div>
                    </div>
                    <span className="text-xs text-slate-500 shrink-0">{fechaHora(ev.created_at)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
