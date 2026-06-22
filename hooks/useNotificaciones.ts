'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Notificacion } from '@/types';

export const useNotificaciones = (userId: string | undefined) => {
  const [list, setList] = useState<Notificacion[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const load = useCallback(async () => {
    const res = await fetch('/api/notificaciones');
    if (res.ok) {
      const data = await res.json();
      setList(data.items as Notificacion[]);
      setUnreadCount(data.unreadCount as number);
    }
  }, []);

  useEffect(() => {
    if (!userId) return;
    // El setState ocurre tras await (deferido); falso positivo de set-state-in-effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const supabase = createClient();
    const channel = supabase
      .channel(`notif-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notificaciones', filter: `destinatario_id=eq.${userId}` },
        (payload) => {
          setList((prev) => [payload.new as Notificacion, ...prev].slice(0, 20));
          setUnreadCount((c) => c + 1);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, load]);

  const markAllRead = useCallback(async () => {
    await fetch('/api/notificaciones/marcar-leidas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    setList((prev) => prev.map((n) => ({ ...n, leida: true })));
    setUnreadCount(0);
  }, []);

  const markRead = useCallback(async (notifId: string) => {
    await fetch('/api/notificaciones/marcar-leidas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [notifId] }),
    });
    setList((prev) => prev.map((n) => (n.id === notifId ? { ...n, leida: true } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
  }, []);

  return { list, unreadCount, markAllRead, markRead };
};
