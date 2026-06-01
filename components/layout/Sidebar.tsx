'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard,
  FolderKanban,
  Calendar,
  BarChart3,
  Bell,
  FileText,
  Users,
  Settings,
  ChevronLeft,
  ChevronRight,
  Zap,
} from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/proyectos', label: 'Proyectos', icon: FolderKanban },
  { href: '/calendario', label: 'Calendario', icon: Calendar },
  { href: '/reportes', label: 'Reportes', icon: BarChart3 },
  { href: '/alertas', label: 'Alertas', icon: Bell },
  { href: '/documentos', label: 'Documentos', icon: FileText },
  { href: '/usuarios', label: 'Usuarios', icon: Users },
  { href: '/configuracion', label: 'Configuración', icon: Settings },
];

export const Sidebar = () => {
  const pathname = usePathname();
  const { sidebarCollapsed, toggleSidebar } = useAppStore();

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 h-screen bg-[var(--navy)] border-r border-slate-800 flex flex-col z-40 transition-all duration-300',
        sidebarCollapsed ? 'w-[68px]' : 'w-[248px]'
      )}
    >
      {/* Logo */}
      <div className="h-[62px] flex items-center px-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" />
          </div>
          {!sidebarCollapsed && (
            <span className="text-lg font-bold text-white tracking-tight">
              BBTI <span className="text-cyan-400">ERP</span>
            </span>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
                isActive
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              )}
            >
              <Icon className="w-5 h-5 shrink-0" />
              {!sidebarCollapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={toggleSidebar}
        className="h-12 flex items-center justify-center border-t border-slate-800 text-slate-400 hover:text-white transition-colors"
      >
        {sidebarCollapsed ? (
          <ChevronRight className="w-5 h-5" />
        ) : (
          <ChevronLeft className="w-5 h-5" />
        )}
      </button>
    </aside>
  );
};
