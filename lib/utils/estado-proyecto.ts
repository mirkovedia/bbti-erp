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

// ---------------------------------------------------------------------------
// Confirmación manual de etapas (sign-off)
// ---------------------------------------------------------------------------

export type EtapaFlujo = 'ingenieria' | 'logistica' | 'produccion' | 'pruebas' | 'completado';

export const FLOW_ETAPAS: EtapaFlujo[] = ['ingenieria', 'logistica', 'produccion', 'pruebas', 'completado'];

export const ETAPA_LABEL: Record<EtapaFlujo, string> = {
  ingenieria: 'Ingeniería',
  logistica: 'Logística',
  produccion: 'Producción',
  pruebas: 'Pruebas',
  completado: 'Completado',
};

/** Permiso requerido para firmar/deshacer cada etapa. */
export const permForEtapa = (
  etapa: EtapaFlujo
): 'canEditIngenieria' | 'canEditLogistica' | 'canEditProduccion' =>
  etapa === 'ingenieria' ? 'canEditIngenieria'
  : etapa === 'logistica' ? 'canEditLogistica'
  : 'canEditProduccion';

export interface FlujoInput {
  confirmaciones?: { etapa: string; confirmada_por?: string | null; confirmada_at?: string | null }[];
  documentos?: { estado?: string | null }[];
  materiales?: { estado?: string | null }[];
  etapas?: { estado?: string | null }[];
}

const confirmadasSet = (input: FlujoInput): Set<EtapaFlujo> =>
  new Set((input.confirmaciones ?? []).map((c) => c.etapa as EtapaFlujo));

/** ¿Está cada etapa lista para firmar? (etapa anterior firmada + datos del área listos) */
export const computeReadiness = (input: FlujoInput): Record<EtapaFlujo, boolean> => {
  const c = confirmadasSet(input);
  const planos = planosAprobados(input.documentos);
  const mats = input.materiales ?? [];
  const materialesOk = mats.length > 0 && mats.every((m) => m.estado === 'COMPLETO');
  const etps = input.etapas ?? [];
  const etapasOk = etps.length > 0 && etps.every((e) => e.estado === 'COMPLETADO');

  return {
    ingenieria: planos,
    logistica: c.has('ingenieria') && materialesOk,
    produccion: c.has('logistica') && etapasOk,
    pruebas: c.has('produccion'),
    completado: c.has('pruebas'),
  };
};

/** Estado del proyecto a partir del conjunto de etapas firmadas. */
export const computeEstadoFromConfirmaciones = (confirmadas: Set<EtapaFlujo>): EstadoProyecto => {
  if (confirmadas.has('completado')) return 'COMPLETADO';
  if (confirmadas.has('produccion') || confirmadas.has('pruebas')) return 'LISTO PARA PRUEBAS';
  if (confirmadas.has('logistica')) return 'EN PRODUCCIÓN';
  if (confirmadas.has('ingenieria')) return 'COMPRAS EN CURSO';
  return 'EN INGENIERÍA';
};

/** La etapa dada y todas las posteriores (para el deshacer en cascada). */
export const cascadeEtapas = (etapa: EtapaFlujo): EtapaFlujo[] =>
  FLOW_ETAPAS.slice(FLOW_ETAPAS.indexOf(etapa));

export type FilaFlujoStatus = 'confirmada' | 'lista' | 'faltan_datos' | 'esperando';

export interface FilaFlujo {
  etapa: EtapaFlujo;
  label: string;
  status: FilaFlujoStatus;
  detalle: string;
  confirmadaPor: string | null;
  confirmadaAt: string | null;
}

/** Filas para el panel verificador: estado + texto de detalle por etapa. */
export const computeFlujoRows = (input: FlujoInput): FilaFlujo[] => {
  const c = confirmadasSet(input);
  const ready = computeReadiness(input);
  const mats = input.materiales ?? [];
  const matComprados = mats.filter((m) => m.estado === 'COMPLETO').length;
  const etps = input.etapas ?? [];
  const etpDone = etps.filter((e) => e.estado === 'COMPLETADO').length;

  const detalleFor = (etapa: EtapaFlujo, status: FilaFlujoStatus): string => {
    if (etapa === 'ingenieria') {
      if (status === 'lista') return 'Planos aprobados';
      if (status === 'faltan_datos') return 'Falta un plano "Aprobados y firmados"';
      return '';
    }
    if (etapa === 'logistica') {
      if (status === 'esperando') return 'Esperando Ingeniería';
      if (mats.length === 0) return 'Sin materiales cargados';
      return `Materiales ${matComprados}/${mats.length} comprados`;
    }
    if (etapa === 'produccion') {
      if (status === 'esperando') return 'Esperando Logística';
      if (etps.length === 0) return 'Sin etapas cargadas';
      return `Etapas ${etpDone}/${etps.length} completadas`;
    }
    if (etapa === 'pruebas') {
      return status === 'esperando' ? 'Esperando Producción' : 'Lista para confirmar';
    }
    return status === 'esperando' ? 'Esperando Pruebas' : 'Lista para confirmar';
  };

  return FLOW_ETAPAS.map((etapa, i) => {
    const conf = (input.confirmaciones ?? []).find((x) => x.etapa === etapa);
    let status: FilaFlujoStatus;
    if (c.has(etapa)) status = 'confirmada';
    else {
      const prevOk = i === 0 || c.has(FLOW_ETAPAS[i - 1]);
      if (!prevOk) status = 'esperando';
      else status = ready[etapa] ? 'lista' : 'faltan_datos';
    }
    return {
      etapa,
      label: ETAPA_LABEL[etapa],
      status,
      detalle: detalleFor(etapa, status),
      confirmadaPor: conf?.confirmada_por ?? null,
      confirmadaAt: conf?.confirmada_at ?? null,
    };
  });
};
