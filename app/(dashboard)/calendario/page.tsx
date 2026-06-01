'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Proyecto, EstadoProyecto } from '@/types';
import { cn } from '@/lib/utils';

const ESTADO_COLORS: Record<EstadoProyecto, string> = {
  'EN PRODUCCIÓN': 'bg-blue-500',
  'LISTO PARA PRUEBAS': 'bg-amber-500',
  'EN INGENIERÍA': 'bg-cyan-500',
  'COMPRAS EN CURSO': 'bg-violet-500',
  RETRASADO: 'bg-red-500',
  COMPLETADO: 'bg-green-500',
};

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export default function CalendarioPage() {
  const router = useRouter();
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/proyectos');
        const data = await res.json();
        setProyectos(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('Error fetching proyectos:', err);
      }
    };
    fetchData();
  }, []);

  // Mapa fecha (YYYY-MM-DD) -> proyectos con entrega ese día
  const eventos = useMemo(() => {
    const map = new Map<string, Proyecto[]>();
    for (const p of proyectos) {
      const fecha = p.comercial?.fecha_entrega;
      if (!fecha) continue;
      const key = fecha.split('T')[0];
      const arr = map.get(key) ?? [];
      arr.push(p);
      map.set(key, arr);
    }
    return map;
  }, [proyectos]);

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else setViewMonth((m) => m + 1);
  };

  const todayKey = new Date().toISOString().split('T')[0];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Calendario</h1>
          <p className="text-slate-400 mt-1">Fechas de entrega de proyectos</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={prevMonth} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-white font-semibold min-w-[160px] text-center">
            {MESES[viewMonth]} {viewYear}
          </span>
          <button onClick={nextMonth} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="bg-[var(--navy2)] rounded-xl border border-slate-800 p-4">
        <div className="grid grid-cols-7 gap-1 mb-2">
          {DIAS.map((d) => (
            <div key={d} className="text-center text-xs font-medium text-slate-400 py-2">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, idx) => {
            if (day === null) return <div key={`empty-${idx}`} className="aspect-square" />;
            const key = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayEventos = eventos.get(key) ?? [];
            const isToday = key === todayKey;
            return (
              <div
                key={key}
                className={cn(
                  'aspect-square rounded-lg border p-1.5 flex flex-col gap-1 overflow-hidden',
                  isToday ? 'border-blue-500 bg-blue-500/5' : 'border-slate-800 bg-slate-900/30'
                )}
              >
                <span className={cn('text-xs font-medium', isToday ? 'text-blue-400' : 'text-slate-400')}>{day}</span>
                <div className="flex flex-col gap-0.5 overflow-hidden">
                  {dayEventos.slice(0, 3).map((p) => (
                    <button
                      key={p.id}
                      onClick={() => router.push(`/proyectos/${p.id}`)}
                      title={`${p.id} · ${p.cliente} · ${p.estado}`}
                      className={cn(
                        'text-[10px] leading-tight text-white rounded px-1 py-0.5 truncate text-left hover:opacity-80 transition-opacity',
                        ESTADO_COLORS[p.estado]
                      )}
                    >
                      {p.cliente}
                    </button>
                  ))}
                  {dayEventos.length > 3 && (
                    <span className="text-[10px] text-slate-500">+{dayEventos.length - 3} más</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Leyenda */}
      <div className="flex flex-wrap gap-4">
        {(Object.keys(ESTADO_COLORS) as EstadoProyecto[]).map((estado) => (
          <div key={estado} className="flex items-center gap-2">
            <span className={cn('w-3 h-3 rounded', ESTADO_COLORS[estado])} />
            <span className="text-xs text-slate-400">{estado}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
