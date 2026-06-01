import { cn } from '@/lib/utils';

interface Props {
  value: number;
  showLabel?: boolean;
  className?: string;
}

export const ProgressBar = ({ value, showLabel = true, className }: Props) => {
  const clampedValue = Math.min(100, Math.max(0, value));

  const getColor = () => {
    if (clampedValue >= 80) return 'bg-green-500';
    if (clampedValue >= 50) return 'bg-amber-500';
    return 'bg-red-500';
  };

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-500', getColor())}
          style={{ width: `${clampedValue}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-xs font-medium text-slate-400 w-8 text-right">
          {clampedValue}%
        </span>
      )}
    </div>
  );
};
