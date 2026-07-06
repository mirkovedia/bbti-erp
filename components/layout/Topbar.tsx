'use client';

import { LogOut, Menu } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/store/appStore';
import { NotificacionesBell } from '@/components/layout/NotificacionesBell';
import { cn } from '@/lib/utils';

const rolColors: Record<string, string> = {
  Administrador: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
  'Gerencia General': 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  Comercial: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  Ingeniería: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  Logística: 'bg-green-500/20 text-green-300 border-green-500/30',
  Producción: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  Finanzas: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  'Solo Lectura': 'bg-slate-500/20 text-slate-300 border-slate-500/30',
};

export const Topbar = () => {
  const router = useRouter();
  const { user, setUser, sidebarCollapsed, mobileSidebarOpen, setMobileSidebarOpen } = useAppStore();

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (err) {
      // Aunque falle la red, el logout local procede (cookie expira sola)
      console.error('Error al cerrar sesión:', err);
    }
    setUser(null);
    router.push('/login');
  };

  return (
    <header
      className={cn(
        'fixed top-0 right-0 h-[62px] bg-[var(--navy2)] border-b border-slate-800 flex items-center justify-between px-4 md:px-6 z-30 transition-all duration-300 left-0',
        sidebarCollapsed ? 'md:left-[68px]' : 'md:left-[248px]'
      )}
    >
      <div className="flex items-center gap-3">
        <button
          onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 focus:outline-none md:hidden shrink-0"
          title="Abrir menú"
        >
          <Menu className="w-5 h-5" />
        </button>
        <h2 className="text-xs sm:text-sm font-medium text-slate-400 truncate max-w-[160px] sm:max-w-none">
          Sistema de Gestión de Proyectos
        </h2>
      </div>

      <div className="flex items-center gap-2 sm:gap-4">
        {/* Notifications bell */}
        <NotificacionesBell />

        {/* User info */}
        {user && (
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="text-right hidden xs:block">
              <p className="text-sm font-medium text-white truncate max-w-[100px] sm:max-w-[160px]" title={user.nombre}>
                {user.nombre}
              </p>
              <span
                className={cn(
                  'inline-block text-[10px] sm:text-xs px-2 py-0.5 rounded-full border leading-tight',
                  rolColors[user.rol] || 'bg-slate-500/20 text-slate-300'
                )}
              >
                {user.rol}
              </span>
            </div>
            
            {/* Fallback user avatar or tiny indicator for super small screens if xs:block is hidden */}
            <div className="xs:hidden w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-blue-400">
              {user.nombre.charAt(0)}
            </div>

            <button
              onClick={handleLogout}
              className="p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
              title="Cerrar sesión"
            >
              <LogOut className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
