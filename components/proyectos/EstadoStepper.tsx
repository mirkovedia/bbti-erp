'use client';

import { Fragment } from 'react';
import { Check } from 'lucide-react';
import type { Proyecto } from '@/types';
import { computeFlow, activeStageIndex, FLOW_STAGES } from '@/lib/utils/estado-proyecto';
import { cn } from '@/lib/utils';

interface Props {
  proyecto: Proyecto;
}

/** Barra de progreso del flujo: Ingeniería → Logística → Producción → Pruebas → Completado. */
export const EstadoStepper = ({ proyecto }: Props) => {
  const flow = computeFlow({
    documentos: proyecto.documentos,
    materiales: proyecto.logistica?.materiales,
    etapas: proyecto.produccion?.etapas,
    pruebas: proyecto.produccion?.pruebas,
    envio: proyecto.produccion?.envio,
  });
  const done = [flow.ingenieria, flow.logistica, flow.produccion, flow.pruebas, flow.completado];
  const active = activeStageIndex(flow);

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
