/**
 * Formatea un número con separador de miles (coma): 15000 -> "15,000.00".
 * Usa 'en-US' para garantizar la coma como separador de miles.
 */
export const nf = (value: number): string =>
  (value ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Formatea un monto en soles con separador de miles: "S/ 15,000.00".
 */
export const fm = (value: number, moneda = 'S/'): string => `${moneda} ${nf(value)}`;

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

/**
 * Tiempo relativo legible a partir de un ISO timestamp.
 * Nota: usa Date.now() — solo para UI (no para lógica testeada).
 */
export const tiempoRelativo = (iso: string): string => {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'ayer' : `hace ${d} días`;
};

/**
 * Fecha + hora exacta (es-PE), ej. "07/06/2026 14:30".
 */
export const fechaHora = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-PE', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};
