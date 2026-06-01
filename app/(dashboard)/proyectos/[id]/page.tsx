'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Save } from 'lucide-react';
import { Proyecto } from '@/types';
import { TabComercial } from '@/components/proyectos/tabs/TabComercial';
import { TabIngenieria } from '@/components/proyectos/tabs/TabIngenieria';
import { TabLogistica } from '@/components/proyectos/tabs/TabLogistica';
import { TabProduccion } from '@/components/proyectos/tabs/TabProduccion';
import { TabFinanzas } from '@/components/proyectos/tabs/TabFinanzas';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { cn } from '@/lib/utils';

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

  useEffect(() => {
    const fetchProyecto = async () => {
      try {
        const res = await fetch(`/api/proyectos/${params.id}`);
        if (!res.ok) throw new Error('Not found');
        const data = await res.json();
        setProyecto(data);
      } catch {
        router.push('/proyectos');
      } finally {
        setLoading(false);
      }
    };

    fetchProyecto();
  }, [params.id, router]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 bg-slate-800 rounded animate-pulse" />
        <div className="h-64 bg-slate-800/50 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!proyecto) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/proyectos')}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white">{proyecto.id}</h1>
              <StatusBadge estado={proyecto.estado} />
            </div>
            <p className="text-slate-400 mt-1">
              {proyecto.cliente} • Creado: {proyecto.fecha_creacion} • Monto: S/ {proyecto.monto.toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-800">
        <nav className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors',
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
