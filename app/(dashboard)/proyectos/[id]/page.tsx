'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { ArrowLeft } from 'lucide-react';
import { Proyecto } from '@/types';
import { nextSyncToken, applyIfFresh } from '@/lib/utils/proyecto-sync';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { EstadoStepper } from '@/components/proyectos/EstadoStepper';
import { FlujoVerificacion } from '@/components/proyectos/FlujoVerificacion';
import { fm } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

// Skeleton mientras se carga el chunk de una pestaña
const TabLoading = () => (
  <div className="h-64 bg-slate-800/30 rounded-lg animate-pulse" />
);

// Lazy-load por pestaña: solo se compila/descarga el chunk de la pestaña activa.
// Reduce el tiempo de compilación on-demand en dev y aligera el bundle inicial.
const TabComercial = dynamic(
  () => import('@/components/proyectos/tabs/TabComercial').then((m) => m.TabComercial),
  { loading: TabLoading }
);
const TabIngenieria = dynamic(
  () => import('@/components/proyectos/tabs/TabIngenieria').then((m) => m.TabIngenieria),
  { loading: TabLoading }
);
const TabLogistica = dynamic(
  () => import('@/components/proyectos/tabs/TabLogistica').then((m) => m.TabLogistica),
  { loading: TabLoading }
);
const TabProduccion = dynamic(
  () => import('@/components/proyectos/tabs/TabProduccion').then((m) => m.TabProduccion),
  { loading: TabLoading }
);
const TabFinanzas = dynamic(
  () => import('@/components/proyectos/tabs/TabFinanzas').then((m) => m.TabFinanzas),
  { loading: TabLoading }
);

const tabs = [
  { id: 'comercial', label: 'Comercial' },
  { id: 'ingenieria', label: 'Ingeniería' },
  { id: 'logistica', label: 'Logística' },
  { id: 'produccion', label: 'Producción' },
  { id: 'finanzas', label: 'Finanzas' },
];

export default function ProyectoDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [proyecto, setProyecto] = useState<Proyecto | null>(null);
  const [activeTab, setActiveTab] = useState('comercial');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params.id) return;
    const fetchProyecto = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/proyectos/${params.id}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Error ${res.status} al cargar el proyecto`);
        }
        const data = await res.json();
        setProyecto(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error desconocido');
      } finally {
        setLoading(false);
      }
    };

    fetchProyecto();
  }, [params.id]);

  // Tiempo real (polling): refresca el proyecto cada 10s para ver los cambios
  // de OTROS usuarios sin F5. El token descarta la respuesta del poll si llega
  // después de una acción local más nueva (mismo anti last-writer-wins que
  // usan las tabs); las tabs con edición local solo adoptan si no hay cambios
  // sin guardar.
  useEffect(() => {
    if (!params.id) return;
    const timer = setInterval(async () => {
      if (document.hidden) return; // pestaña en segundo plano: no gastar red
      const token = nextSyncToken();
      try {
        const res = await fetch(`/api/proyectos/${params.id}`);
        if (res.ok) applyIfFresh(token, await res.json(), setProyecto);
      } catch {
        // fallo de red transitorio: el próximo tick reintenta
      }
    }, 10_000);
    return () => clearInterval(timer);
  }, [params.id]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 bg-slate-800 rounded animate-pulse" />
        <div className="h-64 bg-slate-800/50 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-red-400 font-medium mb-2">No se pudo cargar el proyecto</p>
        <p className="text-slate-500 text-sm mb-6">{error}</p>
        <button
          onClick={() => router.push('/proyectos')}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors"
        >
          Volver a proyectos
        </button>
      </div>
    );
  }

  if (!proyecto) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3 sm:gap-4">
          <button
            onClick={() => router.push('/proyectos')}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0 mt-1 sm:mt-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold text-white truncate">{proyecto.id}</h1>
              <StatusBadge estado={proyecto.estado} />
            </div>
            <p className="text-slate-400 mt-1 text-xs sm:text-sm leading-relaxed flex flex-wrap items-center gap-1 sm:gap-1.5">
              <span className="text-white font-medium truncate max-w-[140px] sm:max-w-none">{proyecto.cliente}</span>
              <span>•</span>
              <span>Creado: {proyecto.fecha_creacion}</span>
              <span>•</span>
              <span className="inline-block">Monto: {fm(proyecto.monto)}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Stepper del flujo (estado por firmas) */}
      <EstadoStepper proyecto={proyecto} />

      {/* Verificador del flujo (firmas de etapa) */}
      <FlujoVerificacion proyecto={proyecto} onUpdate={setProyecto} />

      {/* Tabs */}
      <div className="border-b border-slate-800 overflow-x-auto scrollbar-none">
        <nav className="flex gap-1 min-w-max">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors shrink-0',
                activeTab === tab.id
                  ? 'bg-slate-800 text-blue-400 border-b-2 border-blue-400'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              )}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="bg-[var(--navy2)] rounded-xl border border-slate-800 p-6">
        {activeTab === 'comercial' && <TabComercial proyecto={proyecto} onUpdate={setProyecto} />}
        {activeTab === 'ingenieria' && <TabIngenieria proyecto={proyecto} onUpdate={setProyecto} />}
        {activeTab === 'logistica' && <TabLogistica proyecto={proyecto} onUpdate={setProyecto} />}
        {activeTab === 'produccion' && <TabProduccion proyecto={proyecto} onUpdate={setProyecto} />}
        {activeTab === 'finanzas' && <TabFinanzas proyecto={proyecto} onUpdate={setProyecto} />}
      </div>
    </div>
  );
}
