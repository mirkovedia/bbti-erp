/**
 * Secuenciador de actualizaciones del proyecto (anti last-writer-wins).
 *
 * En el detalle de proyecto cada panel (tabs y verificador de flujo) hace su propio
 * PATCH y reemplaza el proyecto COMPLETO con la respuesta (`onUpdate(setProyecto)`).
 * Si dos PATCH se solapan —p. ej. aprobar un plano y enseguida firmar la etapa— el
 * que resuelve último gana, aunque su snapshot sea más viejo: la respuesta del primero
 * (sin la confirmación) puede pisar el estado fresco del segundo y dejar la UI un paso
 * atrás. El `estado` se DERIVA en el servidor en cada respuesta, así que el problema es
 * puramente el ORDEN DE LLEGADA, no el contenido.
 *
 * Solución: estampar el orden de EMISIÓN con un token monotónico (síncrono, antes de
 * lanzar el fetch) y, al aplicar, descartar toda respuesta cuyo token haya quedado por
 * detrás de una emisión posterior YA aplicada. Así la última acción emitida es la que
 * fija el estado final, sin importar el orden en que vuelvan las respuestas.
 *
 * El contador es monotónico de por vida (no necesita reset): al navegar entre proyectos
 * cada carga obtiene un token mayor que cualquier mutación previa, así que siempre aplica.
 */

let issueSeq = 0;
let appliedSeq = 0;

/** Token de emisión. Llamar SINCRÓNICAMENTE justo antes de lanzar el fetch/cambio. */
export const nextSyncToken = (): number => ++issueSeq;

/**
 * Aplica `value` sólo si su token no quedó obsoleto frente a una emisión más nueva ya
 * aplicada. Devuelve true si se aplicó, false si se descartó por obsoleto.
 */
export const applyIfFresh = <T>(token: number, value: T, apply: (v: T) => void): boolean => {
  if (token < appliedSeq) return false;
  appliedSeq = token;
  apply(value);
  return true;
};

/** Solo para tests: reinicia los contadores. No usar en producción. */
export const __resetSyncForTests = (): void => {
  issueSeq = 0;
  appliedSeq = 0;
};
