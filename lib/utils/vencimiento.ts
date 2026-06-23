import type { EstadoProyecto } from '@/types';

export type TipoVencimiento = 'retrasado' | 'por_vencer';

/** Días enteros entre dos fechas YYYY-MM-DD, calculado como (b - a). */
export const diasDeDiferencia = (a: string, b: string): number => {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
};

/**
 * Clasifica el vencimiento de un proyecto respecto a hoy.
 * - COMPLETADO o sin fecha → null (nunca alerta).
 * - fecha < hoy → 'retrasado'.
 * - hoy <= fecha <= hoy + diasAlerta → 'por_vencer'.
 * - resto → null.
 */
export const clasificarVencimiento = (
  fechaEntrega: string | null | undefined,
  hoy: string,
  diasAlerta: number,
  estado: EstadoProyecto
): TipoVencimiento | null => {
  if (estado === 'COMPLETADO' || !fechaEntrega) return null;
  const diff = diasDeDiferencia(hoy, fechaEntrega); // fechaEntrega - hoy
  if (diff < 0) return 'retrasado';
  if (diff <= diasAlerta) return 'por_vencer';
  return null;
};

/** Texto legible del aviso de vencimiento. */
export const mensajeVencimiento = (
  tipo: TipoVencimiento,
  proyectoId: string,
  cliente: string,
  dias: number,
  etapaLabel: string
): string =>
  tipo === 'retrasado'
    ? `${proyectoId} (${cliente}) está retrasado ${dias} día(s). Está en ${etapaLabel}.`
    : `${proyectoId} (${cliente}) vence en ${dias} día(s). Está en ${etapaLabel}.`;
