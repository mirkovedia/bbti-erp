'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';
import { useAppStore } from '@/store/appStore';
import { cn } from '@/lib/utils';
import type { Rol, Permissions } from '@/types';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { user, setUser, sidebarCollapsed, mobileSidebarOpen, setMobileSidebarOpen } = useAppStore();

  useEffect(() => {
    const loadData = async () => {
      // Perfil, permisos y configuración vía API (ya no hay cliente de BD en el navegador).
      const meRes = await fetch('/api/auth/me');
      if (!meRes.ok) {
        setUser(null);
        router.push('/login');
        return;
      }
      const { user: perfil } = await meRes.json();

      const yaCargado = !!user && user.id === perfil.id;
      const [permsRes, configRes] = await Promise.all([
        fetch('/api/role-permissions'),
        fetch('/api/configuracion'),
      ]);

      if (permsRes.ok) {
        const permsMap = (await permsRes.json()) as Record<Rol, Permissions>;
        useAppStore.getState().setRolePermissions(permsMap);
      }

      if (configRes.ok) {
        const configData = await configRes.json();
        useAppStore.getState().setCompanyConfig(
          configData.moneda || 'S/',
          Number(configData.igv) || 18
        );
      }

      if (!yaCargado) {
        setUser(perfil);
      }
    };

    loadData();
  }, [user, setUser, router]);

  // Mientras se carga la sesión, mostrar un loader a pantalla completa
  // para que las páginas hijas no evalúen permisos con user === null
  if (!user) {
    return (
      <div className="min-h-screen bg-[var(--navy)] flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--navy)]">
      {/* Backdrop for mobile sidebar */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-30 md:hidden transition-opacity duration-300"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      <Sidebar />
      <Topbar />
      <main
        className={cn(
          'pt-[62px] transition-all duration-300 min-h-screen ml-0',
          sidebarCollapsed ? 'md:ml-[68px]' : 'md:ml-[248px]'
        )}
      >
        <div className="p-4 md:p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
