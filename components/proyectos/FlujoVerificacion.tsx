'use client';

import { useState } from 'react';
import { Check, Loader2, CircleDashed, AlertCircle, Undo2 } from 'lucide-react';
import type { Proyecto } from '@/types';
import { useAppStore } from '@/store/appStore';
import { can } from '@/lib/auth/permissions';
import { computeFlujoRows, permsForEtapa, type EtapaFlujo } from '@/lib/utils/estado-proyecto';
import { nextSyncToken, applyIfFresh } from '@/lib/utils/proyecto-sync';
import { cn } from '@/lib/utils';
import { fechaHora } from '@/lib/utils/format';

interface Props {
  proyecto: Proyecto;
  onUpdate: (p: Proyecto) => void;
}

/** Panel verificador: confirma/deshace cada etapa del flujo (sign-off manual). */
export const FlujoVerificacion = ({ proyecto, onUpdate }: Props) => {
  const { user } = useAppStore();
  const [busy, setBusy] = useState<EtapaFlujo | null>(null);

  const rows = computeFlujoRows({
    confirmaciones: proyecto.confirmaciones,
    documentos: proyecto.documentos,
    materiales: proyecto.logistica?.materiales,
    etapas: proyecto.produccion?.etapas,
    // "Completado" exige pago al 100% (misma fórmula que TabFinanzas)
    monto: proyecto.monto,
    adelanto: proyecto.comercial?.adelanto,
    pagos: proyecto.finanzas?.pagos,
  });

  const accion = async (etapa: EtapaFlujo, tipo: 'confirmar' | 'deshacer') => {
    setBusy(etapa);
    try {
      const body = tipo === 'confirmar' ? { confirmarEtapa: { etapa } } : { deshacerEtapa: { etapa } };
      const token = nextSyncToken();
      const res = await fetch(`/api/proyectos/${proyecto.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      // El PATCH devuelve el proyecto ya actualizado → un solo viaje (sin GET extra).
      // applyIfFresh descarta esta respuesta si una acción posterior ya se aplicó.
      if (res.ok) applyIfFresh(token, await res.json(), onUpdate);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="bg-[var(--navy2)] rounded-xl border border-slate-800 p-5">
      <h3 className="text-sm font-semibold text-slate-300 mb-4">Verificación del flujo</h3>
      <div className="space-y-2">
        {rows.map((row, i) => {
          const puede = permsForEtapa(row.etapa).some((p) => can(user, p));
          const loading = busy === row.etapa;
          return (
            <div
              key={row.etapa}
              className="flex items-center gap-3 p-3 rounded-lg border border-slate-700 bg-slate-800/30"
            >
              {/* Ícono de estado */}
              <span className="shrink-0">
                {row.status === 'confirmada' ? (
                  <Check className="w-5 h-5 text-green-400" />
                ) : row.status === 'lista' ? (
                  <CircleDashed className="w-5 h-5 text-blue-400" />
                ) : row.status === 'faltan_datos' ? (
                  <AlertCircle className="w-5 h-5 text-amber-400" />
                ) : (
                  <CircleDashed className="w-5 h-5 text-slate-600" />
                )}
              </span>

              {/* Nombre + detalle */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">
                  {i + 1}. {row.label}
                </p>
                <p
                  className={cn(
                    'text-xs',
                    row.status === 'confirmada' ? 'text-green-400/80'
                    : row.status === 'lista' ? 'text-blue-400/80'
                    : row.status === 'faltan_datos' ? 'text-amber-400/80'
                    : 'text-slate-500'
                  )}
                >
                  {row.status === 'confirmada'
                    ? `Confirmada${row.confirmadaPor ? ' · ' + row.confirmadaPor : ''}${row.confirmadaAt ? ' · ' + fechaHora(row.confirmadaAt) : ''}`
                    : row.detalle}
                </p>
              </div>

              {/* Acción */}
              <div className="shrink-0">
                {row.status === 'confirmada' ? (
                  puede ? (
                    <button
                      onClick={() => accion(row.etapa, 'deshacer')}
                      disabled={loading}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Undo2 className="w-3.5 h-3.5" />}
                      Deshacer
                    </button>
                  ) : null
                ) : row.status === 'lista' ? (
                  puede ? (
                    <button
                      onClick={() => accion(row.etapa, 'confirmar')}
                      disabled={loading}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-green-600 hover:bg-green-500 text-white rounded-lg transition-colors disabled:opacity-50"
                    >
                      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      Confirmar
                    </button>
                  ) : (
                    <span className="text-xs text-slate-500">Pendiente</span>
                  )
                ) : (
                  <span className="text-xs text-slate-600">—</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
