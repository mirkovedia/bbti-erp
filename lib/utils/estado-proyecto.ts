import type { EstadoProyecto, EtapaFlujo } from '@/types';

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

// ---------------------------------------------------------------------------
// Confirmación manual de etapas (sign-off)
// ---------------------------------------------------------------------------

// EtapaFlujo se define una sola vez en @/types; se re-exporta acá por comodidad
// de los consumidores que ya importan desde este módulo (rutas API, cron).
export type { EtapaFlujo };

export const FLOW_ETAPAS: EtapaFlujo[] = ['ingenieria', 'logistica', 'produccion', 'pruebas', 'completado'];

export const ETAPA_LABEL: Record<EtapaFlujo, string> = {
  ingenieria: 'Ingeniería',
  logistica: 'Logística',
  produccion: 'Producción',
  pruebas: 'Pruebas',
  completado: 'Completado',
};

/** Permisos que habilitan firmar/deshacer cada etapa (basta con tener uno). */
export const permsForEtapa = (
  etapa: EtapaFlujo
): Array<'canEditIngenieria' | 'canEditLogistica' | 'canEditProduccion' | 'canEditFinance'> =>
  etapa === 'ingenieria' ? ['canEditIngenieria']
  : etapa === 'logistica' ? ['canEditLogistica']
  // Completado también la firma Finanzas: el cierre exige el pago al 100%,
  // así que quien cobra puede dar el cierre (decisión 2026-07-01).
  : etapa === 'completado' ? ['canEditProduccion', 'canEditFinance']
  : ['canEditProduccion'];

export interface FlujoInput {
  confirmaciones?: { etapa: string; confirmada_por?: string | null; confirmada_at?: string | null }[];
  documentos?: { estado?: string | null }[];
  materiales?: { estado?: string | null }[];
  etapas?: { estado?: string | null }[];
  /** Requisito de pago de "Completado": misma fórmula que TabFinanzas
   *  (pagado = comercial.adelanto + Σ pagos; pendiente = monto − pagado). */
  monto?: number | null;
  adelanto?: number | null;
  pagos?: { monto?: number | null }[];
}

/** Saldo por cobrar, redondeado a céntimos (evita ruido de coma flotante). */
const pagoPendiente = (input: FlujoInput): number => {
  const pagado = (input.adelanto ?? 0) + (input.pagos ?? []).reduce((s, p) => s + (p.monto ?? 0), 0);
  return Math.max(0, Math.round(((input.monto ?? 0) - pagado) * 100) / 100);
};

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
    completado: c.has('pruebas') && pagoPendiente(input) === 0,
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

type FilaFlujoStatus = 'confirmada' | 'lista' | 'faltan_datos' | 'esperando';

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
    // Completado: requiere pruebas firmadas + pago al 100%.
    if (status === 'esperando') return 'Esperando Pruebas';
    if (status === 'faltan_datos') {
      return `Falta cobrar S/ ${pagoPendiente(input).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    }
    return 'Pago completo — lista para confirmar';
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
