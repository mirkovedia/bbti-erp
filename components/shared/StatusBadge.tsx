import { EstadoProyecto } from '@/types';
import { cn } from '@/lib/utils';

const statusConfig: Record<EstadoProyecto, { bg: string; text: string; border: string }> = {
  'EN PRODUCCIÓN': { bg: 'bg-blue-500/20', text: 'text-blue-300', border: 'border-blue-500/30' },
  'LISTO PARA PRUEBAS': { bg: 'bg-amber-500/20', text: 'text-amber-300', border: 'border-amber-500/30' },
  'EN INGENIERÍA': { bg: 'bg-cyan-500/20', text: 'text-cyan-300', border: 'border-cyan-500/30' },
  'COMPRAS EN CURSO': { bg: 'bg-violet-500/20', text: 'text-violet-300', border: 'border-violet-500/30' },
  'RETRASADO': { bg: 'bg-red-500/20', text: 'text-red-300', border: 'border-red-500/30' },
  'COMPLETADO': { bg: 'bg-green-500/20', text: 'text-green-300', border: 'border-green-500/30' },
};

interface Props {
  estado: EstadoProyecto;
  className?: string;
}

const FALLBACK = { bg: 'bg-slate-500/20', text: 'text-slate-300', border: 'border-slate-500/30' };

export const StatusBadge = ({ estado, className }: Props) => {
  const config = statusConfig[estado] ?? FALLBACK;
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border',
        config.bg,
        config.text,
        config.border,
        className
      )}
    >
      {estado}
    </span>
  );
};
