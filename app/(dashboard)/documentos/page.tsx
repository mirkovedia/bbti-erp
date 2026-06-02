'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Download, Search, File, FileSpreadsheet } from 'lucide-react';

interface Documento {
  id: string;
  proyecto_id: string;
  cliente: string;
  nombre: string;
  tipo: string | null;
  storage_path: string | null;
  subido_por: string | null;
  created_at: string;
}

const tipoIcon = (tipo: string | null) => {
  if (tipo === 'xlsx') return <FileSpreadsheet className="w-5 h-5 text-green-400" />;
  if (tipo === 'pdf') return <FileText className="w-5 h-5 text-red-400" />;
  return <File className="w-5 h-5 text-slate-400" />;
};

export default function DocumentosPage() {
  const router = useRouter();
  const [docs, setDocs] = useState<Documento[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [proyectoFilter, setProyectoFilter] = useState('');

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

  const proyectos = useMemo(
    () => Array.from(new Set(docs.map((d) => d.proyecto_id))).sort(),
    [docs]
  );

  const filtered = docs.filter((d) => {
    const q = search.toLowerCase();
    const matchesSearch =
      (d.nombre ?? '').toLowerCase().includes(q) ||
      (d.cliente ?? '').toLowerCase().includes(q);
    const matchesProyecto = !proyectoFilter || d.proyecto_id === proyectoFilter;
    return matchesSearch && matchesProyecto;
  });

  const handleDownload = async (doc: Documento) => {
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
                  </div>
                </div>
                <span className="text-xs text-slate-500 shrink-0">
                  {doc.created_at ? new Date(doc.created_at).toLocaleDateString('es-PE') : '—'}
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
    </div>
  );
}
