'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
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
} from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { can } from '@/lib/auth/permissions';
import type { Permissions } from '@/types';
import { cn } from '@/lib/utils';

// `perm`: si está presente, el item solo se muestra a quien tenga ese permiso
// (Usuarios y Configuración = funciones de sistema, solo Admin).
const navItems: { href: string; label: string; icon: typeof FolderKanban; perm?: keyof Permissions }[] = [
  { href: '/', label: 'Inicio', icon: LayoutDashboard },
  { href: '/proyectos', label: 'Proyectos', icon: FolderKanban },
  { href: '/calendario', label: 'Calendario', icon: Calendar },
  { href: '/reportes', label: 'Reportes', icon: BarChart3 },
  { href: '/alertas', label: 'Alertas', icon: Bell },
  { href: '/documentos', label: 'Documentos', icon: FileText },
  { href: '/usuarios', label: 'Usuarios', icon: Users, perm: 'canManageUsers' },
  { href: '/configuracion', label: 'Configuración', icon: Settings, perm: 'canConfig' },
];

export const Sidebar = () => {
  const pathname = usePathname();
  const { sidebarCollapsed, toggleSidebar, user, mobileSidebarOpen, setMobileSidebarOpen } = useAppStore();
  const visibleItems = navItems.filter((item) => !item.perm || can(user, item.perm));

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 h-screen bg-[var(--brand-teal)] border-r border-black/20 flex flex-col z-40 transition-all duration-300 transform',
        mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        sidebarCollapsed ? 'w-[248px] md:w-[68px]' : 'w-[248px]'
      )}
    >
      {/* Logo */}
      <div className="h-[62px] flex items-center px-4 border-b border-black/20">
        {sidebarCollapsed ? (
          <>
            <div className="hidden md:flex w-9 h-9 rounded-lg bg-[var(--brand-amber)] items-center justify-center font-bold text-[#1a1206]">
              b
            </div>
            <div className="flex md:hidden items-center gap-2">
              <Image
                src="/bbti-logo.png"
                alt="BBTI"
                width={96}
                height={23}
                priority
                className="h-[22px] w-auto"
              />
              <span className="text-[10px] font-semibold tracking-wide text-[#1a1206] bg-[var(--brand-amber)] px-1.5 py-0.5 rounded">
                ERP
              </span>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2">
            <Image
              src="/bbti-logo.png"
              alt="BBTI"
              width={96}
              height={23}
              priority
              className="h-[22px] w-auto"
            />
            <span className="text-[10px] font-semibold tracking-wide text-[#1a1206] bg-[var(--brand-amber)] px-1.5 py-0.5 rounded">
              ERP
            </span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
        {visibleItems.map((item) => {
          const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileSidebarOpen(false)}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
                isActive
                  ? 'bg-[var(--brand-amber)] text-[#1a1206] font-semibold'
                  : 'text-slate-200/80 hover:text-white hover:bg-black/20'
              )}
            >
              <Icon className="w-5 h-5 shrink-0" />
              <span className={cn(sidebarCollapsed ? 'md:hidden' : 'block')}>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={toggleSidebar}
        className="h-12 hidden md:flex items-center justify-center border-t border-black/20 text-slate-300 hover:text-white transition-colors"
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
