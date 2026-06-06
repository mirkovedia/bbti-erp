'use client';

import { Fragment } from 'react';
import { Check } from 'lucide-react';
import type { Proyecto } from '@/types';
import { FLOW_STAGES, FLOW_ETAPAS, type EtapaFlujo } from '@/lib/utils/estado-proyecto';
import { cn } from '@/lib/utils';

interface Props {
  proyecto: Proyecto;
}

/** Barra de progreso del flujo: Ingeniería → Logística → Producción → Pruebas → Completado. */
export const EstadoStepper = ({ proyecto }: Props) => {
  const confirmadas = new Set((proyecto.confirmaciones ?? []).map((c) => c.etapa as EtapaFlujo));
  const done = FLOW_ETAPAS.map((e) => confirmadas.has(e));
  const firstPending = done.indexOf(false);
  const active = firstPending === -1 ? FLOW_STAGES.length : firstPending;

  return (
    <div className="flex items-center w-full bg-[var(--navy2)] rounded-xl border border-slate-800 px-6 py-4">
      {FLOW_STAGES.map((stage, i) => {
        const isDone = done[i];
        const isActive = i === active && !isDone;
        return (
          <Fragment key={stage}>
            <div className="flex flex-col items-center shrink-0">
              <div
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-colors',
                  isDone
                    ? 'bg-green-500 border-green-500 text-white'
                    : isActive
                    ? 'bg-blue-500/20 border-blue-500 text-blue-400'
                    : 'bg-slate-800 border-slate-700 text-slate-500'
                )}
              >
                {isDone ? <Check className="w-4 h-4" /> : i + 1}
              </div>
              <span
                className={cn(
                  'text-xs mt-1.5 whitespace-nowrap',
                  isDone ? 'text-green-400' : isActive ? 'text-blue-400 font-medium' : 'text-slate-500'
                )}
              >
                {stage}
              </span>
            </div>
            {i < FLOW_STAGES.length - 1 && (
              <div className={cn('flex-1 h-0.5 mx-2 -mt-5 transition-colors', isDone ? 'bg-green-500' : 'bg-slate-700')} />
            )}
          </Fragment>
        );
      })}
    </div>
  );
};
