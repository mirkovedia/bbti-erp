'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';
import { useAppStore } from '@/store/appStore';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { user, setUser, sidebarCollapsed } = useAppStore();

  useEffect(() => {
    const loadUser = async () => {
      const supabase = createClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();

      if (!authUser) {
        router.push('/login');
        return;
      }

      const { data: userData } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .single();

      if (userData) {
        setUser(userData);
      }
    };

    if (!user) {
      loadUser();
    }
  }, [user, setUser, router]);

  return (
    <div className="min-h-screen bg-[var(--navy)]">
      <Sidebar />
      <Topbar />
      <main
        className={cn(
          'pt-[62px] transition-all duration-300 min-h-screen',
          sidebarCollapsed ? 'ml-[68px]' : 'ml-[248px]'
        )}
      >
        <div className="p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
