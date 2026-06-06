'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, FileText, CheckCircle2, Package, Flag } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useNotificaciones } from '@/hooks/useNotificaciones';
import { tiempoRelativo } from '@/lib/utils/format';
import type { Notificacion, TipoNotificacion } from '@/types';
import { cn } from '@/lib/utils';

const iconFor: Record<TipoNotificacion, typeof Bell> = {
  documento: FileText,
  confirmacion: CheckCircle2,
  datos: Package,
  hito: Flag,
};

const colorFor: Record<TipoNotificacion, string> = {
  documento: 'text-blue-400',
  confirmacion: 'text-green-400',
  datos: 'text-amber-400',
  hito: 'text-violet-400',
};

export const NotificacionesBell = () => {
  const router = useRouter();
  const { user } = useAppStore();
  const { list, unreadCount, markAllRead, markRead } = useNotificaciones(user?.id);
  const [open, setOpen] = useState(false);

  const onClickItem = (n: Notificacion) => {
    if (!n.leida) markRead(n.id);
    setOpen(false);
    if (n.proyecto_id) router.push(`/proyectos/${n.proyecto_id}`);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold bg-red-500 text-white rounded-full">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* backdrop para cerrar al hacer click afuera */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-80 max-h-[28rem] overflow-y-auto bg-[var(--navy2)] border border-slate-800 rounded-xl shadow-xl z-50">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
              <span className="text-sm font-semibold text-white">Notificaciones</span>
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="text-xs text-blue-400 hover:text-blue-300">
                  Marcar todas como leídas
                </button>
              )}
            </div>

            {list.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-slate-500">Sin notificaciones</div>
            ) : (
              <ul>
                {list.map((n) => {
                  const Icon = iconFor[n.tipo] ?? Bell;
                  return (
                    <li key={n.id}>
                      <button
                        onClick={() => onClickItem(n)}
                        className={cn(
                          'w-full flex items-start gap-3 px-4 py-3 text-left border-b border-slate-800/60 hover:bg-slate-800/40 transition-colors',
                          !n.leida && 'bg-slate-800/30'
                        )}
                      >
                        <Icon className={cn('w-4 h-4 mt-0.5 shrink-0', colorFor[n.tipo] ?? 'text-slate-400')} />
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm text-white">{n.mensaje}</span>
                          <span className="block text-xs text-slate-500 mt-0.5">
                            {n.actor ? `${n.actor} · ` : ''}{tiempoRelativo(n.created_at)}
                          </span>
                        </span>
                        {!n.leida && <span className="w-2 h-2 mt-1.5 rounded-full bg-blue-500 shrink-0" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
};
