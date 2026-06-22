'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';
import { useAppStore } from '@/store/appStore';
import { createClient } from '@/lib/supabase/client';
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
      const supabase = createClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();

      if (!authUser) {
        setUser(null);
        router.push('/login');
        return;
      }

      // Cargar permisos de roles desde la base de datos
      const { data: permsData } = await supabase
        .from('role_permissions')
        .select('*');

      if (permsData && permsData.length > 0) {
        const permsMap = permsData.reduce<Record<string, Permissions>>((acc, row) => {
          acc[row.rol] = row.permissions as Permissions;
          return acc;
        }, {});
        useAppStore.getState().setRolePermissions(permsMap as Record<Rol, Permissions>);
      }

      // Cargar configuración de la empresa (moneda, igv)
      const { data: configData } = await supabase
        .from('company_config')
        .select('moneda, igv')
        .limit(1)
        .maybeSingle();

      if (configData) {
        useAppStore.getState().setCompanyConfig(
          configData.moneda || 'S/',
          Number(configData.igv) || 18
        );
      }

      // Si ya tenemos en memoria al usuario correcto, no recargamos el perfil.
      if (user && user.id === authUser.id) return;

      // Usuario distinto (o primer login): cargamos sus datos frescos.
      const { data: userData } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .single();

      if (userData) {
        setUser(userData);
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
