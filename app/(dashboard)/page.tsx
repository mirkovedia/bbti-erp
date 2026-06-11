'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { 
  PlusCircle, 
  FileEdit, 
  Trash2, 
  FileSpreadsheet, 
  CheckCircle2, 
  ShoppingCart, 
  MessageSquare, 
  DollarSign, 
  FileUp, 
  Activity,
  FolderKanban,
  Search,
  RefreshCw,
  TrendingUp,
  Bell,
  SlidersHorizontal,
  ChevronRight,
  UserCheck,
  Clock
} from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { fm, tiempoRelativo, fechaHora } from '@/lib/utils/format';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { ProgressBar } from '@/components/shared/ProgressBar';
import { Proyecto, EstadoProyecto } from '@/types';
import { cn } from '@/lib/utils';

interface ActividadLog {
  id: string;
  proyecto_id: string | null;
  cliente: string | null;
  usuario: string;
  rol: string;
  accion: string;
  detalle: string;
  created_at: string;
}

export default function DashboardPage() {
  const { user } = useAppStore();
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [actividades, setActividades] = useState<ActividadLog[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Filtros de la bitácora
  const [search, setSearch] = useState('');
  const [rolFilter, setRolFilter] = useState('');
  const [accionFilter, setAccionFilter] = useState('');

  const fetchDashboardData = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);

    try {
      const [proyRes, actRes, notifRes] = await Promise.all([
        fetch('/api/proyectos'),
        fetch('/api/actividad'),
        fetch('/api/notificaciones')
      ]);

      if (proyRes.ok) {
        const proyData = await proyRes.json();
        setProyectos(proyData);
      }
      if (actRes.ok) {
        const actData = await actRes.json();
        setActividades(actData);
      }
      if (notifRes.ok) {
        const notifData = await notifRes.json();
        setUnreadCount(notifData.unreadCount || 0);
      }
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();

    // Polling en tiempo real cada 10 segundos
    const timer = setInterval(() => {
      fetchDashboardData(true);
    }, 10000);

    return () => clearInterval(timer);
  }, []);

  // Calcular KPIs
  const kpis = useMemo(() => {
    const totalCount = proyectos.length;
    const totalMonto = proyectos.reduce((acc, p) => acc + (p.monto || 0), 0);
    const avgProgreso = totalCount 
      ? Math.round(proyectos.reduce((acc, p) => acc + (p.produccion?.progreso || 0), 0) / totalCount) 
      : 0;

    return {
      totalCount,
      totalMonto,
      avgProgreso,
      unreadCount
    };
  }, [proyectos, unreadCount]);

  // Agrupamiento por Estados
  const estadoDistribucion = useMemo(() => {
    const counts: Record<EstadoProyecto, number> = {
      'EN INGENIERÍA': 0,
      'COMPRAS EN CURSO': 0,
      'EN PRODUCCIÓN': 0,
      'LISTO PARA PRUEBAS': 0,
      'RETRASADO': 0,
      'COMPLETADO': 0
    };

    proyectos.forEach(p => {
      if (p.estado in counts) {
        counts[p.estado as EstadoProyecto]++;
      }
    });

    return Object.entries(counts).map(([estado, count]) => ({
      estado: estado as EstadoProyecto,
      count,
      percentage: proyectos.length ? Math.round((count / proyectos.length) * 100) : 0
    })).sort((a, b) => b.count - a.count);
  }, [proyectos]);

  // Configuración de badges para roles
  const getRoleBadgeConfig = (rol: string) => {
    switch (rol?.toLowerCase()) {
      case 'administrador':
        return { label: 'Admin', bg: 'bg-red-500/15 text-red-300 border-red-500/20' };
      case 'gerencia general':
        return { label: 'Gerente', bg: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/20' };
      case 'comercial':
        return { label: 'Comercial', bg: 'bg-blue-500/15 text-blue-300 border-blue-500/20' }; // Amber
      case 'ingeniería':
      case 'ingenieria':
        return { label: 'Ingeniería', bg: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/20' }; // Teal
      case 'logística':
      case 'logistica':
        return { label: 'Logística', bg: 'bg-violet-500/15 text-violet-300 border-violet-500/20' };
      case 'finanzas':
        return { label: 'Finanzas', bg: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20' };
      case 'producción':
      case 'produccion':
        return { label: 'Producción', bg: 'bg-amber-600/15 text-amber-300 border-amber-600/20' };
      default:
        return { label: rol || 'Usuario', bg: 'bg-slate-500/15 text-slate-300 border-slate-500/20' };
    }
  };

  // Configuración de íconos según acción
  const getActionConfig = (accion: string) => {
    switch (accion?.toLowerCase()) {
      case 'creacion':
      case 'creación':
        return { icon: PlusCircle, bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' };
      case 'edicion':
      case 'edición':
        return { icon: FileEdit, bg: 'bg-slate-500/10 text-slate-300 border-slate-500/20' };
      case 'eliminacion':
      case 'eliminación':
      case 'documento_eliminacion':
        return { icon: Trash2, bg: 'bg-red-500/10 text-red-400 border-red-500/20' };
      case 'metrado':
        return { icon: FileSpreadsheet, bg: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' };
      case 'firma':
        return { icon: CheckCircle2, bg: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' }; // Teal
      case 'compras':
        return { icon: ShoppingCart, bg: 'bg-violet-500/10 text-violet-400 border-violet-500/20' };
      case 'comentario':
      case 'observacion':
      case 'observación':
        return { icon: MessageSquare, bg: 'bg-sky-500/10 text-sky-400 border-sky-500/20' };
      case 'pago':
        return { icon: DollarSign, bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' };
      case 'documento_subida':
        return { icon: FileUp, bg: 'bg-blue-500/10 text-blue-400 border-blue-500/20' }; // Amber
      default:
        return { icon: Activity, bg: 'bg-slate-500/10 text-slate-300 border-slate-500/20' };
    }
  };

  // Filtrado de Actividades
  const filteredActividades = useMemo(() => {
    const q = search.toLowerCase();
    return actividades.filter((act) => {
      const matchText = 
        (act.usuario || '').toLowerCase().includes(q) || 
        (act.detalle || '').toLowerCase().includes(q) || 
        (act.proyecto_id || '').toLowerCase().includes(q) || 
        (act.cliente || '').toLowerCase().includes(q);
      
      const matchRol = !rolFilter || act.rol?.toLowerCase() === rolFilter.toLowerCase();
      
      let matchAccion = true;
      if (accionFilter) {
        if (accionFilter === 'documento') {
          matchAccion = act.accion.startsWith('documento_');
        } else {
          matchAccion = act.accion.toLowerCase() === accionFilter.toLowerCase();
        }
      }

      return matchText && matchRol && matchAccion;
    });
  }, [actividades, search, rolFilter, accionFilter]);

  // Lista de Roles únicos presentes en las actividades para poblar filtro
  const availableRoles = useMemo(() => {
    const roles = new Set<string>();
    actividades.forEach(a => {
      if (a.rol) roles.add(a.rol);
    });
    return Array.from(roles);
  }, [actividades]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] gap-4">
        <div className="w-12 h-12 border-4 border-[var(--brand-amber)] border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-400 font-medium animate-pulse">Sincronizando Centro de Control...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-[var(--navy2)] to-[#0c152d] border border-slate-800/80 p-6 rounded-2xl shadow-xl">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
              Bienvenido, {user?.nombre || 'Operador'} 👋
            </h1>
            <span className={cn(
              "text-xs px-2.5 py-0.5 rounded-full font-semibold border uppercase tracking-wider",
              getRoleBadgeConfig(user?.rol || '').bg
            )}>
              {user?.rol || 'Rol'}
            </span>
          </div>
          <p className="text-slate-400 text-sm md:text-base mt-1.5 flex items-center gap-1.5 font-medium">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            Centro de Control: Monitoreo y Trazabilidad de Planta en Vivo
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchDashboardData(true)}
            className="flex items-center justify-center p-2.5 rounded-xl border border-slate-800 bg-slate-900/60 hover:bg-slate-800 text-slate-300 hover:text-white transition-all shadow-md group"
            title="Refrescar datos"
          >
            <RefreshCw className={cn("w-5 h-5", refreshing && "animate-spin")} />
          </button>
          
          <Link 
            href="/alertas" 
            className="flex items-center gap-2 bg-slate-900/60 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-200 hover:text-white px-4 py-2.5 rounded-xl transition-all shadow-md"
          >
            <div className="relative">
              <Bell className="w-5 h-5" />
              {kpis.unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-extrabold w-4.5 h-4.5 rounded-full flex items-center justify-center animate-bounce">
                  {kpis.unreadCount}
                </span>
              )}
            </div>
            <span className="hidden sm:inline text-sm font-medium">Alertas</span>
          </Link>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1 */}
        <Link 
          href="/proyectos"
          className="group relative flex flex-col justify-between p-5 rounded-2xl bg-[var(--navy2)] border border-slate-800 hover:border-cyan-500/50 hover:bg-slate-900/40 transition-all duration-300 shadow-lg cursor-pointer overflow-hidden"
        >
          <div className="absolute top-0 left-0 h-1 w-full bg-cyan-500" />
          <div className="flex items-center justify-between">
            <span className="text-slate-400 font-semibold text-xs tracking-wider uppercase">Proyectos Activos</span>
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center text-cyan-400 group-hover:scale-110 transition-transform">
              <FolderKanban className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <span className="text-3xl font-extrabold text-white font-mono">{kpis.totalCount}</span>
            <p className="text-slate-400 text-xs mt-1 flex items-center gap-1">
              Ver órdenes de trabajo en curso <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </p>
          </div>
        </Link>

        {/* KPI 2 */}
        <div className="relative flex flex-col justify-between p-5 rounded-2xl bg-[var(--navy2)] border border-slate-800 hover:border-violet-500/50 hover:bg-slate-900/40 transition-all duration-300 shadow-lg overflow-hidden">
          <div className="absolute top-0 left-0 h-1 w-full bg-violet-500" />
          <div className="flex items-center justify-between">
            <span className="text-slate-400 font-semibold text-xs tracking-wider uppercase">Progreso de Producción</span>
            <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center text-violet-400">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <span className="text-3xl font-extrabold text-white font-mono">{kpis.avgProgreso}%</span>
            <div className="mt-2.5">
              <ProgressBar value={kpis.avgProgreso} className="h-1.5 w-full bg-slate-800" />
            </div>
          </div>
        </div>

        {/* KPI 3 */}
        <div className="relative flex flex-col justify-between p-5 rounded-2xl bg-[var(--navy2)] border border-slate-800 hover:border-blue-500/50 hover:bg-slate-900/40 transition-all duration-300 shadow-lg overflow-hidden">
          {/* Blue in theme is brand amber */}
          <div className="absolute top-0 left-0 h-1 w-full bg-[var(--brand-amber)]" />
          <div className="flex items-center justify-between">
            <span className="text-slate-400 font-semibold text-xs tracking-wider uppercase">Monto en Control</span>
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <span className="text-2xl font-extrabold text-white font-mono tracking-tight">
              {fm(kpis.totalMonto)}
            </span>
            <p className="text-slate-400 text-xs mt-1">Suma total de presupuestos PRs</p>
          </div>
        </div>

        {/* KPI 4 */}
        <Link
          href="/alertas"
          className="group relative flex flex-col justify-between p-5 rounded-2xl bg-[var(--navy2)] border border-slate-800 hover:border-red-500/50 hover:bg-slate-900/40 transition-all duration-300 shadow-lg cursor-pointer overflow-hidden"
        >
          <div className="absolute top-0 left-0 h-1 w-full bg-red-500" />
          <div className="flex items-center justify-between">
            <span className="text-slate-400 font-semibold text-xs tracking-wider uppercase">Alertas Críticas</span>
            <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center text-red-400 group-hover:scale-110 transition-transform">
              <Bell className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <span className="text-3xl font-extrabold text-white font-mono">{kpis.unreadCount}</span>
            <p className="text-slate-400 text-xs mt-1 flex items-center gap-1">
              Notificaciones sin leer <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </p>
          </div>
        </Link>
      </div>

      {/* Main Content Areas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Command Center Feed */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-[var(--navy2)] border border-slate-800/80 rounded-2xl p-6 shadow-xl space-y-6">
            
            {/* Feed Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Activity className="w-5 h-5 text-blue-400 animate-pulse" />
                  Línea de Tiempo en Vivo
                </h2>
                <p className="text-xs text-slate-400 mt-1">Bitácora de operaciones y trazabilidad cruzada en planta</p>
              </div>

              {/* Polling status badge */}
              <div className="inline-flex items-center gap-2 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-full">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
                  Sincronizado
                </span>
              </div>
            </div>

            {/* Filter controls */}
            <div className="flex flex-col sm:flex-row gap-3 bg-slate-900/50 p-4 rounded-xl border border-slate-800/60">
              {/* Search */}
              <div className="flex-1 relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar usuario, cliente, PR o detalle..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-[var(--brand-amber)] rounded-lg pl-10 pr-4 py-2 text-sm text-slate-200 placeholder-slate-500 outline-none transition-colors"
                />
              </div>

              {/* Selects wrapper */}
              <div className="flex items-center gap-2.5">
                <div className="relative">
                  <select
                    value={rolFilter}
                    onChange={(e) => setRolFilter(e.target.value)}
                    className="bg-slate-950 border border-slate-800 focus:border-[var(--brand-amber)] rounded-lg px-3 py-2 text-xs text-slate-300 outline-none cursor-pointer"
                  >
                    <option value="">Todos los Roles</option>
                    {availableRoles.map(role => (
                      <option key={role} value={role}>{role}</option>
                    ))}
                  </select>
                </div>

                <div className="relative">
                  <select
                    value={accionFilter}
                    onChange={(e) => setAccionFilter(e.target.value)}
                    className="bg-slate-950 border border-slate-800 focus:border-[var(--brand-amber)] rounded-lg px-3 py-2 text-xs text-slate-300 outline-none cursor-pointer"
                  >
                    <option value="">Todas las Acciones</option>
                    <option value="creacion">Creación</option>
                    <option value="firma">Firma/Aprobación</option>
                    <option value="metrado">Excel Metrado</option>
                    <option value="compras">Materiales/Compras</option>
                    <option value="pago">Pagos/Finanzas</option>
                    <option value="comentario">Comentarios</option>
                    <option value="documento">Documentos (Upload/Del)</option>
                    <option value="eliminacion">Borrados</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Timeline items wrapper */}
            {filteredActividades.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-500 bg-slate-900/10 border border-dashed border-slate-850 rounded-2xl">
                <Activity className="w-8 h-8 mb-2 opacity-40 text-slate-400" />
                <p className="text-sm">No se encontraron actividades recientes.</p>
                <p className="text-xs text-slate-600 mt-1">Prueba limpiando o modificando los filtros.</p>
              </div>
            ) : (
              <div className="relative border-l-2 border-slate-800/80 ml-5 py-2 space-y-6">
                {filteredActividades.map((act) => {
                  const actConfig = getActionConfig(act.accion);
                  const roleConfig = getRoleBadgeConfig(act.rol);
                  const Icon = actConfig.icon;

                  return (
                    <div key={act.id} className="relative pl-7 group">
                      
                      {/* Timeline dot */}
                      <div className={cn(
                        "absolute -left-[17px] top-1 flex items-center justify-center w-8 h-8 rounded-full border shadow-md transition-transform duration-300 group-hover:scale-110",
                        actConfig.bg
                      )}>
                        <Icon className="w-4 h-4" />
                      </div>

                      {/* Content Card */}
                      <div className="bg-slate-900/30 hover:bg-slate-900/60 border border-slate-800/80 hover:border-slate-700/80 rounded-xl p-4 transition-all duration-300 shadow-md hover:shadow-lg">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-white text-sm">
                              {act.usuario}
                            </span>
                            <span className={cn(
                              "text-[10px] px-2 py-0.5 rounded-full font-medium border uppercase tracking-wider",
                              roleConfig.bg
                            )}>
                              {roleConfig.label}
                            </span>
                          </div>

                          <span 
                            className="text-[10px] text-slate-400 font-mono flex items-center gap-1 shrink-0 bg-slate-950 px-2 py-1 rounded-md border border-slate-800/50" 
                            title={fechaHora(act.created_at)}
                          >
                            <Clock className="w-3 h-3 text-slate-500" />
                            {tiempoRelativo(act.created_at)}
                          </span>
                        </div>

                        {/* Action text */}
                        <p className="text-sm text-slate-300 mt-2 font-medium font-sans">
                          {act.detalle}
                        </p>

                        {/* Interactive metadata tags */}
                        {act.proyecto_id && (
                          <div className="mt-3.5 flex flex-wrap items-center gap-2 pt-2.5 border-t border-slate-800/50">
                            <Link 
                              href={`/proyectos/${act.proyecto_id}`}
                              className="inline-flex items-center gap-1.5 text-xs font-mono font-bold bg-blue-500/10 text-blue-400 hover:text-blue-300 hover:bg-blue-500/20 border border-blue-500/20 px-2.5 py-1 rounded-lg transition-all"
                            >
                              <FolderKanban className="w-3.5 h-3.5" />
                              {act.proyecto_id}
                            </Link>

                            {act.cliente && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-slate-900/90 text-slate-400 border border-slate-800 px-2.5 py-1 rounded-lg">
                                <UserCheck className="w-3 h-3 text-slate-500" />
                                <span className="text-slate-500 mr-0.5 font-semibold">Cliente:</span> {act.cliente}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Status Summary & Quick Info */}
        <div className="space-y-6">
          
          {/* Project State Distribution */}
          <div className="bg-[var(--navy2)] border border-slate-800/80 rounded-2xl p-6 shadow-xl space-y-4">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <SlidersHorizontal className="w-5 h-5 text-cyan-400" />
                Distribución de Estados
              </h2>
              <p className="text-xs text-slate-400 mt-1">Resumen del flujo actual de proyectos en fábrica</p>
            </div>

            <div className="space-y-3 pt-2">
              {estadoDistribucion.map((dist) => (
                <div key={dist.estado} className="space-y-1 bg-slate-900/20 border border-slate-900 p-3 rounded-xl hover:border-slate-800 transition-colors">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-300">{dist.estado}</span>
                    <span className="font-mono font-bold text-white bg-slate-950 px-2 py-0.5 rounded-full border border-slate-800">
                      {dist.count} PR{dist.count !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-900">
                      <div 
                        className={cn(
                          "h-full rounded-full transition-all duration-500",
                          dist.estado === 'EN INGENIERÍA' && 'bg-cyan-500',
                          dist.estado === 'COMPRAS EN CURSO' && 'bg-violet-500',
                          dist.estado === 'EN PRODUCCIÓN' && 'bg-blue-500', // Brand Amber
                          dist.estado === 'LISTO PARA PRUEBAS' && 'bg-amber-500',
                          dist.estado === 'RETRASADO' && 'bg-red-500',
                          dist.estado === 'COMPLETADO' && 'bg-green-500'
                        )}
                        style={{ width: `${dist.percentage}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-mono text-slate-500 w-8 text-right shrink-0">
                      {dist.percentage}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Shortcuts */}
          <div className="bg-[var(--navy2)] border border-slate-800/80 rounded-2xl p-6 shadow-xl space-y-4">
            <h2 className="text-lg font-bold text-white">Accesos Rápidos</h2>
            
            <div className="grid grid-cols-1 gap-2.5">
              <Link
                href="/proyectos"
                className="flex items-center justify-between p-3.5 rounded-xl bg-slate-900/50 hover:bg-slate-800/50 border border-slate-800/80 hover:border-cyan-500/30 text-slate-300 hover:text-white transition-all group"
              >
                <div className="flex items-center gap-3">
                  <FolderKanban className="w-5 h-5 text-cyan-400" />
                  <span className="text-sm font-semibold">Ordenes de Trabajo</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500 group-hover:translate-x-0.5 transition-transform" />
              </Link>

              <Link
                href="/calendario"
                className="flex items-center justify-between p-3.5 rounded-xl bg-slate-900/50 hover:bg-slate-800/50 border border-slate-800/80 hover:border-amber-500/30 text-slate-300 hover:text-white transition-all group"
              >
                <div className="flex items-center gap-3">
                  <Activity className="w-5 h-5 text-amber-500" />
                  <span className="text-sm font-semibold">Calendario de Entregas</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500 group-hover:translate-x-0.5 transition-transform" />
              </Link>

              <Link
                href="/reportes"
                className="flex items-center justify-between p-3.5 rounded-xl bg-slate-900/50 hover:bg-slate-800/50 border border-slate-800/80 hover:border-violet-500/30 text-slate-300 hover:text-white transition-all group"
              >
                <div className="flex items-center gap-3">
                  <TrendingUp className="w-5 h-5 text-violet-400" />
                  <span className="text-sm font-semibold">Reportes de Rendimiento</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
