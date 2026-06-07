'use client';

import { useEffect } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Error boundary del dashboard: si una vista lanza al renderizar, en vez de
 * congelar la pantalla, muestra una salida clara para reintentar o recargar.
 */
export default function DashboardError({ error, reset }: Props) {
  useEffect(() => {
    console.error('Error en el dashboard:', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
      <div className="w-14 h-14 rounded-full bg-red-500/15 flex items-center justify-center mb-4">
        <AlertTriangle className="w-7 h-7 text-red-400" />
      </div>
      <h2 className="text-xl font-bold text-white mb-1">Algo salió mal</h2>
      <p className="text-slate-400 max-w-md mb-6">
        Ocurrió un problema al mostrar esta sección. Puedes reintentar; si persiste, recarga la página.
      </p>
      <div className="flex gap-3">
        <button
          onClick={() => reset()}
          className="flex items-center gap-2 px-4 py-2.5 bg-[var(--brand-amber)] hover:brightness-110 text-[#1a1206] font-semibold rounded-lg transition-all"
        >
          <RotateCcw className="w-4 h-4" />
          Reintentar
        </button>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2.5 border border-slate-600 text-slate-300 rounded-lg hover:bg-slate-800 transition-colors"
        >
          Recargar página
        </button>
      </div>
    </div>
  );
}
