'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/store/appStore';
import { createClient } from '@/lib/supabase/client';
import { User } from '@/types';

export const useAuth = () => {
  const router = useRouter();
  const { user, setUser } = useAppStore();

  useEffect(() => {
    const supabase = createClient();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_OUT' || !session) {
          setUser(null);
          router.push('/login');
          return;
        }

        if (event === 'SIGNED_IN' && session.user) {
          const { data } = await supabase
            .from('users')
            .select('*')
            .eq('id', session.user.id)
            .single();

          if (data) {
            setUser(data as User);
          }
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [router, setUser]);

  return { user };
};
