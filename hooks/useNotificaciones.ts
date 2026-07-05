'use client';

import { useEffect, useState, useCallback } from 'react';
import type { Notificacion } from '@/types';

const POLL_MS = 20_000;

// Realtime de Supabase → polling: mismo contrato del hook, así
// NotificacionesBell no cambia. El aumento de unreadCount entre polls
// dispara el mismo efecto visual/sonoro que antes disparaba el INSERT.
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
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
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
