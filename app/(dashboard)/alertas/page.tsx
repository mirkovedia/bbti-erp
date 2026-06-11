'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, AlertTriangle, Clock, DollarSign, CheckCheck } from 'lucide-react';
import { Proyecto } from '@/types';
import { diasRestantes } from '@/lib/utils/format';
import { cn } from '@/lib/utils';

type TipoAlerta = 'retraso' | 'entrega' | 'pago';

interface Alerta {
  id: string;
  proyectoId: string;
  cliente: string;
  tipo: TipoAlerta;
  mensaje: string;
}

const tipoConfig: Record<TipoAlerta, { icon: typeof Bell; color: string; bg: string }> = {
  retraso: { icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30' },
  entrega: { icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30' },
  pago: { icon: DollarSign, color: 'text-violet-400', bg: 'bg-violet-500/10 border-violet-500/30' },
};

export default function AlertasPage() {
  const router = useRouter();
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [loading, setLoading] = useState(true);
  const [leidas, setLeidas] = useState<Set<string>>(new Set());

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

  const alertas = useMemo<Alerta[]>(() => {
    const result: Alerta[] = [];
    for (const p of proyectos) {
      const dias = diasRestantes(p.comercial?.fecha_entrega);
      if (p.estado === 'RETRASADO' || (dias !== null && dias < 0)) {
        result.push({
          id: `${p.id}-retraso`,
          proyectoId: p.id,
          cliente: p.cliente,
          tipo: 'retraso',
          mensaje: dias !== null && dias < 0
            ? `Orden retrasada ${Math.abs(dias)} día(s) respecto a la fecha de entrega.`
            : 'Orden marcada como RETRASADA.',
        });
      } else if (dias !== null && dias >= 0 && dias <= 3) {
        result.push({
          id: `${p.id}-entrega`,
          proyectoId: p.id,
          cliente: p.cliente,
          tipo: 'entrega',
          mensaje: dias === 0 ? 'La entrega vence hoy.' : `Entrega próxima en ${dias} día(s).`,
        });
      }
      if (p.comercial?.alerta) {
        result.push({
          id: `${p.id}-com`,
          proyectoId: p.id,
          cliente: p.cliente,
          tipo: 'entrega',
          mensaje: p.comercial.alerta,
        });
      }
      if (p.finanzas?.alerta) {
        result.push({
          id: `${p.id}-fin`,
          proyectoId: p.id,
          cliente: p.cliente,
          tipo: 'pago',
          mensaje: p.finanzas.alerta,
        });
      }
    }
    return result;
  }, [proyectos]);

  const noLeidas = alertas.filter((a) => !leidas.has(a.id));

  const marcarTodas = () => setLeidas(new Set(alertas.map((a) => a.id)));

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-slate-800 rounded animate-pulse" />
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-16 bg-slate-800/50 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Alertas</h1>
          <p className="text-slate-400 mt-1">
            {noLeidas.length} sin leer · {alertas.length} en total
          </p>
        </div>
        {noLeidas.length > 0 && (
          <button
            onClick={marcarTodas}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800/60 border border-slate-700 hover:bg-slate-700/60 text-white font-medium rounded-lg transition-all shrink-0"
          >
            <CheckCheck className="w-4 h-4" />
            Marcar todas como leídas
          </button>
        )}
      </div>

      {alertas.length === 0 ? (
        <div className="bg-[var(--navy2)] rounded-xl border border-slate-800 p-12 text-center">
          <Bell className="w-16 h-16 mx-auto mb-4 text-slate-600" />
          <p className="text-slate-400">No hay alertas activas. Todo en orden.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {alertas.map((a) => {
            const cfg = tipoConfig[a.tipo];
            const Icon = cfg.icon;
            const isLeida = leidas.has(a.id);
            return (
              <div
                key={a.id}
                onClick={() => router.push(`/proyectos/${a.proyectoId}`)}
                className={cn(
                  'flex items-start gap-4 p-4 rounded-xl border cursor-pointer transition-all hover:translate-y-[-1px]',
                  isLeida ? 'bg-slate-800/20 border-slate-800 opacity-60' : cfg.bg
                )}
              >
                <div className={cn('mt-0.5', cfg.color)}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-blue-400 font-mono text-sm">{a.proyectoId}</span>
                    <span className="text-white text-sm font-medium">{a.cliente}</span>
                    {!isLeida && <span className="w-2 h-2 rounded-full bg-blue-400" />}
                  </div>
                  <p className="text-slate-300 text-sm mt-1">{a.mensaje}</p>
                </div>
                {!isLeida && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setLeidas((prev) => new Set(prev).add(a.id));
                    }}
                    className="text-xs text-slate-400 hover:text-white transition-colors shrink-0"
                  >
                    Marcar leída
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
