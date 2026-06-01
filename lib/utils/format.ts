/**
 * Formatea un monto en soles peruanos.
 */
export const fm = (value: number, moneda = 'S/'): string =>
  `${moneda} ${value.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Fecha de hoy en formato ISO (YYYY-MM-DD).
 */
export const today = (): string => new Date().toISOString().split('T')[0];

/**
 * Iniciales a partir de un nombre completo (máx. 2 letras).
 */
export const ini = (nombre: string): string =>
  nombre
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

/**
 * Días restantes entre hoy y una fecha de entrega.
 * Negativo => retrasado.
 */
export const diasRestantes = (fechaEntrega: string | null | undefined): number | null => {
  if (!fechaEntrega) return null;
  const entrega = new Date(fechaEntrega);
  const hoy = new Date(today());
  const diff = entrega.getTime() - hoy.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};
