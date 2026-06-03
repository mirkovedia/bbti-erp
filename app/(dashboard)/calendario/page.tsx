'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, AlertTriangle } from 'lucide-react';
import { Proyecto } from '@/types';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { cn } from '@/lib/utils';

// Días entre hoy y la fecha de entrega (negativo = vencido)
const diasRestantes = (fecha: string): number => {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const entrega = new Date(`${fecha}T00:00:00`);
  return Math.round((entrega.getTime() - hoy.getTime()) / 86400000);
};

const fmtFecha = (f: string) => {
  const [y, m, d] = f.split('-');
  return `${d}/${m}/${y}`;
};

const barColor = (p: number) => (p >= 80 ? 'bg-green-500' : p >= 50 ? 'bg-amber-500' : 'bg-red-500');

export default function CalendarioPage() {
  const router = useRouter();
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/proyectos');
        const data = await res.json();
        setProyectos(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('Error fetching proyectos:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Solo los que tienen fecha de entrega, ordenados por la más próxima primero
  const conEntrega = useMemo(
    () =>
      proyectos
        .filter((p) => p.comercial?.fecha_entrega)
        .sort((a, b) => (a.comercial!.fecha_entrega < b.comercial!.fecha_entrega ? -1 : 1)),
    [proyectos]
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <CalendarDays className="w-6 h-6 text-blue-400" />
          Calendario de Entregas
        </h1>
        <p className="text-slate-400 mt-1">{conEntrega.length} órdenes con fecha de entrega programada</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-56 bg-slate-800/40 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : conEntrega.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <CalendarDays className="w-14 h-14 mx-auto mb-3 opacity-30" />
          <p>No hay órdenes con fecha de entrega programada.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {conEntrega.map((p) => {
            const fecha = p.comercial!.fecha_entrega;
            const dias = diasRestantes(fecha);
            const vencido = dias < 0;
            const progreso = p.produccion?.progreso || 0;
            const resp = (p.usuario_nombre || '').split(' ')[0] || '—';

            return (
              <button
                key={p.id}
                onClick={() => router.push(`/proyectos/${p.id}`)}
                className="text-left bg-[var(--navy2)] rounded-xl border border-slate-800 p-4 hover:border-slate-600 hover:-translate-y-0.5 transition-all"
              >
                {/* Cabecera */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="min-w-0">
                    <p className="text-blue-400 font-mono font-semibold">{p.id}</p>
                    <p className="text-sm text-slate-300 truncate">{p.cliente}</p>
                  </div>
                  <StatusBadge estado={p.estado} />
                </div>

                {/* Caja de fecha */}
                <div
                  className={cn(
                    'flex items-start gap-3 p-3 rounded-lg border mb-3',
                    vencido ? 'bg-red-500/10 border-red-500/30' : 'bg-blue-500/10 border-blue-500/30'
                  )}
                >
                  <CalendarDays className={cn('w-5 h-5 mt-0.5 shrink-0', vencido ? 'text-red-400' : 'text-blue-300')} />
                  <div>
                    <p className={cn('text-lg font-bold', vencido ? 'text-red-400' : 'text-blue-200')}>{fmtFecha(fecha)}</p>
                    <p className={cn('text-xs flex items-center gap-1', vencido ? 'text-red-300' : 'text-slate-400')}>
                      {vencido && <AlertTriangle className="w-3 h-3" />}
                      {dias === 0 ? 'Entrega hoy' : vencido ? `Retrasado ${Math.abs(dias)} días` : `Faltan ${dias} días`}
                    </p>
                  </div>
                </div>

                {/* Producción */}
                <div className="mb-3">
                  <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                    <span>Producción</span>
                    <span className="font-medium text-white">{progreso}%</span>
                  </div>
                  <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                    <div className={cn('h-full rounded-full transition-all', barColor(progreso))} style={{ width: `${progreso}%` }} />
                  </div>
                </div>

                {/* Pie */}
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Resp: {resp}</span>
                  <span>Monto: S/ {p.monto.toLocaleString('es-PE')}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
