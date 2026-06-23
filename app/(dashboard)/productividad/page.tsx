'use client';

import { useEffect, useState, useCallback } from 'react';
import { Activity, Award, UserCheck, UserX, Loader2, Info } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { can } from '@/lib/auth/permissions';
import { RoleBadge } from '@/components/shared/RoleBadge';
import { ini, tiempoRelativo } from '@/lib/utils/format';
import type { Rol } from '@/types';

interface FilaUsuario {
  nombre: string;
  rol: string | null;
  activo: boolean;
  total: number;
  hitos: number;
  rutina: number;
  proyectos: number;
  ultimaActividad: string | null;
  porAccion: Record<string, number>;
}

interface Resp {
  desde: string;
  hasta: string;
  usuarios: FilaUsuario[];
  totales: { acciones: number; hitos: number; conActividad: number; sinActividad: number };
}

const PRESETS: { label: string; dias: number }[] = [
  { label: 'Hoy', dias: 0 },
  { label: '7 días', dias: 6 },
  { label: '30 días', dias: 29 },
];

// Fecha de hoy en Lima (UTC-5) en formato YYYY-MM-DD.
const hoyLima = () => new Date(Date.now() - 5 * 3_600_000).toISOString().split('T')[0];
const restarDias = (fecha: string, dias: number) =>
  new Date(Date.parse(`${fecha}T00:00:00Z`) - dias * 86_400_000).toISOString().split('T')[0];

export default function ProductividadPage() {
  const { user } = useAppStore();
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [presetDias, setPresetDias] = useState(6);

  const puedeVer = can(user, 'canViewReports');

  const fetchData = useCallback(async (dias: number) => {
    setLoading(true);
    try {
      const hasta = hoyLima();
      const desde = restarDias(hasta, dias);
      const res = await fetch(`/api/productividad?desde=${desde}&hasta=${hasta}`);
      const json = await res.json();
      setData(res.ok ? json : null);
    } catch (err) {
      console.error('Error fetching productividad:', err);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!puedeVer) {
      setLoading(false);
      return;
    }
    // setState tras await (deferido): falso positivo de set-state-in-effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData(presetDias);
  }, [puedeVer, presetDias, fetchData]);

  if (user && !puedeVer) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-amber-400 font-medium mb-1">Acceso restringido</p>
        <p className="text-slate-400">No tienes permiso para ver los reportes de productividad.</p>
      </div>
    );
  }

  const t = data?.totales;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Productividad del equipo</h1>
          <p className="text-slate-400 mt-1">Avance del trabajo registrado por persona</p>
        </div>
        <div className="flex bg-slate-900/60 p-1 rounded-lg border border-slate-800 gap-1">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => setPresetDias(p.dias)}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                presetDias === p.dias ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Aviso de criterio: medimos avance, no presencia. */}
      <div className="flex items-start gap-2.5 bg-blue-500/5 border border-blue-500/20 rounded-lg px-4 py-3">
        <Info className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
        <p className="text-xs text-slate-400 leading-relaxed">
          Este panel mide el <span className="text-slate-200 font-medium">avance del trabajo</span> (hitos y acciones
          registradas en el sistema), no la presencia ni el tiempo en pantalla. Los <span className="text-slate-200 font-medium">hitos</span> son
          acciones de valor real: firmas de etapa, importación de metrado, compras, avance de producción, creación de
          proyectos y subida de documentos.
        </p>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card icon={<Activity className="w-5 h-5" />} label="Acciones totales" value={t?.acciones ?? 0} color="blue" />
        <Card icon={<Award className="w-5 h-5" />} label="Hitos de valor" value={t?.hitos ?? 0} color="amber" />
        <Card icon={<UserCheck className="w-5 h-5" />} label="Con actividad" value={t?.conActividad ?? 0} color="green" />
        <Card icon={<UserX className="w-5 h-5" />} label="Sin actividad" value={t?.sinActividad ?? 0} color="red" />
      </div>

      {/* Tabla */}
      <div className="bg-[var(--navy2)] rounded-xl border border-slate-800 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <Loader2 className="w-8 h-8 mx-auto animate-spin text-blue-500" />
          </div>
        ) : !data || data.usuarios.length === 0 ? (
          <div className="p-12 text-center">
            <Activity className="w-16 h-16 mx-auto mb-4 text-slate-600" />
            <p className="text-slate-400">No hay usuarios para mostrar.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700 bg-slate-800/10">
                  {['Persona', 'Hitos', 'Rutina', 'Total', 'Proyectos', 'Última actividad'].map((h) => (
                    <th
                      key={h}
                      className={`py-3.5 px-4 text-xs font-medium text-slate-400 uppercase tracking-wider ${
                        h === 'Persona' || h === 'Última actividad' ? 'text-left' : 'text-center'
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.usuarios.map((u) => {
                  const sinActividad = u.total === 0;
                  return (
                    <tr
                      key={u.nombre}
                      className={`border-b border-slate-800/50 transition-colors ${
                        sinActividad ? 'bg-red-500/5 hover:bg-red-500/10' : 'hover:bg-slate-800/30'
                      }`}
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center text-white text-xs font-bold shrink-0">
                            {ini(u.nombre)}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-white font-medium truncate max-w-[180px]">{u.nombre}</span>
                              {!u.activo && (
                                <span className="text-[10px] text-slate-500 border border-slate-700 rounded px-1.5 py-0.5">
                                  inactivo
                                </span>
                              )}
                            </div>
                            {u.rol && <RoleBadge rol={u.rol as Rol} />}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="text-amber-300 font-semibold">{u.hitos}</span>
                      </td>
                      <td className="py-3 px-4 text-center text-slate-400">{u.rutina}</td>
                      <td className="py-3 px-4 text-center">
                        <span className={`font-bold ${sinActividad ? 'text-red-400' : 'text-white'}`}>{u.total}</span>
                      </td>
                      <td className="py-3 px-4 text-center text-slate-300">{u.proyectos}</td>
                      <td className="py-3 px-4 text-left">
                        {u.ultimaActividad ? (
                          <span className="text-slate-400 text-sm">{tiempoRelativo(u.ultimaActividad)}</span>
                        ) : (
                          <span className="text-red-400/80 text-sm font-medium">Sin movimientos</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const COLORS: Record<string, string> = {
  blue: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  amber: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  green: 'text-green-400 bg-green-500/10 border-green-500/20',
  red: 'text-red-400 bg-red-500/10 border-red-500/20',
};

const Card = ({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
}) => (
  <div className="bg-[var(--navy2)] rounded-xl border border-slate-800 p-4">
    <div className={`inline-flex items-center justify-center w-10 h-10 rounded-lg border mb-3 ${COLORS[color]}`}>
      {icon}
    </div>
    <p className="text-2xl font-bold text-white">{value}</p>
    <p className="text-xs text-slate-400 mt-0.5">{label}</p>
  </div>
);
