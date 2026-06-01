import { Rol } from '@/types';
import { cn } from '@/lib/utils';

const roleConfig: Record<Rol, string> = {
  Administrador: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
  'Gerencia General': 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  Comercial: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  Ingeniería: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  Logística: 'bg-green-500/20 text-green-300 border-green-500/30',
  Producción: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  Finanzas: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  'Solo Lectura': 'bg-slate-500/20 text-slate-300 border-slate-500/30',
};

interface Props {
  rol: Rol;
  className?: string;
}

export const RoleBadge = ({ rol, className }: Props) => {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border',
        roleConfig[rol],
        className
      )}
    >
      {rol}
    </span>
  );
};
