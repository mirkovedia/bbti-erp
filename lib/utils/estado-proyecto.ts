import type { EstadoProyecto } from '@/types';

/**
 * Lógica del flujo del proyecto: el estado se DERIVA del avance de cada área,
 * no se edita a mano. Flujo: Ingeniería → Logística → Producción → Pruebas → Completado.
 */

export interface EstadoInput {
  /** Documentos del proyecto; los planos están "aprobados" si alguno tiene estado "Aprobados y firmados". */
  documentos?: { estado?: string | null }[];
  materiales?: { estado?: string | null }[];
  etapas?: { estado?: string | null }[];
  pruebas?: boolean | null;
  envio?: boolean | null;
}

export const FLOW_STAGES = ['Ingeniería', 'Logística', 'Producción', 'Pruebas', 'Completado'] as const;
export type FlowStage = (typeof FLOW_STAGES)[number];

// Planos aprobados: algún documento (versión) está en "Aprobados y firmados".
const planosAprobados = (docs?: { estado?: string | null }[]): boolean =>
  (docs ?? []).some((d) => !!d.estado && /aprobad/i.test(d.estado));

export interface FlowProgress {
  /** Ingeniería terminada: planos aprobados */
  ingenieria: boolean;
  /** Logística terminada: todos los materiales comprados (COMPLETO) */
  logistica: boolean;
  /** Producción terminada: todas las etapas COMPLETADO */
  produccion: boolean;
  /** Pruebas terminadas */
  pruebas: boolean;
  /** Completado: pruebas + envío */
  completado: boolean;
}

/** Calcula qué etapas del flujo están terminadas (acumulativo: cada una requiere la anterior). */
export const computeFlow = (input: EstadoInput): FlowProgress => {
  const planos = planosAprobados(input.documentos);
  const mats = input.materiales ?? [];
  const materialesOk = mats.length > 0 && mats.every((m) => m.estado === 'COMPLETO');
  const etapas = input.etapas ?? [];
  const produccionOk = etapas.length > 0 && etapas.every((e) => e.estado === 'COMPLETADO');
  const pruebasOk = !!input.pruebas;
  const envioOk = !!input.envio;

  const ingenieria = planos;
  const logistica = ingenieria && materialesOk;
  const produccion = logistica && produccionOk;
  const pruebas = produccion && pruebasOk;
  const completado = pruebas && envioOk;

  return { ingenieria, logistica, produccion, pruebas, completado };
};

/** Deriva el estado del proyecto desde el avance de las áreas. */
export const computeEstadoProyecto = (input: EstadoInput): EstadoProyecto => {
  const f = computeFlow(input);
  if (f.completado) return 'COMPLETADO';
  if (f.produccion) return 'LISTO PARA PRUEBAS';
  if (f.logistica) return 'EN PRODUCCIÓN';
  if (f.ingenieria) return 'COMPRAS EN CURSO';
  return 'EN INGENIERÍA';
};

/**
 * Superpone el estado RETRASADO: si la fecha de entrega ya pasó y el proyecto
 * no está completado, se muestra como RETRASADO (sin perder su avance real, que
 * lo refleja el stepper). Se calcula al LEER porque depende de la fecha de hoy.
 */
export const aplicarRetraso = (
  estado: EstadoProyecto,
  fechaEntrega?: string | null,
  hoy?: string
): EstadoProyecto => {
  if (estado === 'COMPLETADO') return estado;
  if (!fechaEntrega || !hoy) return estado;
  return fechaEntrega < hoy ? 'RETRASADO' : estado;
};

/** Índice de la etapa activa (primera no terminada) para el stepper. 0..4 */
export const activeStageIndex = (f: FlowProgress): number => {
  if (f.completado) return 4; // Completado
  if (f.produccion) return 3; // en Pruebas
  if (f.logistica) return 2; // en Producción
  if (f.ingenieria) return 1; // en Logística
  return 0; // en Ingeniería
};
