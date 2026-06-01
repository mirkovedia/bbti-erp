'use client';

import { LogOut, Bell } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/store/appStore';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

const rolColors: Record<string, string> = {
  Administrador: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
  'Gerencia General': 'bg-gold-500/20 text-amber-300 border-amber-500/30',
  Comercial: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  Ingeniería: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  Logística: 'bg-green-500/20 text-green-300 border-green-500/30',
  Producción: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  Finanzas: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  'Solo Lectura': 'bg-slate-500/20 text-slate-300 border-slate-500/30',
};

export const Topbar = () => {
  const router = useRouter();
  const { user, sidebarCollapsed } = useAppStore();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  };

  return (
    <header
      className={cn(
        'fixed top-0 right-0 h-[62px] bg-[var(--navy2)] border-b border-slate-800 flex items-center justify-between px-6 z-30 transition-all duration-300',
        sidebarCollapsed ? 'left-[68px]' : 'left-[248px]'
      )}
    >
      <div>
        <h2 className="text-sm font-medium text-slate-400">
          Sistema de Gestión de Proyectos
        </h2>
      </div>

      <div className="flex items-center gap-4">
        {/* Notifications bell */}
        <button className="relative p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
        </button>

        {/* User info */}
        {user && (
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-medium text-white">{user.nombre}</p>
              <span
                className={cn(
                  'inline-block text-xs px-2 py-0.5 rounded-full border',
                  rolColors[user.rol] || 'bg-slate-500/20 text-slate-300'
                )}
              >
                {user.rol}
              </span>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
              title="Cerrar sesión"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
