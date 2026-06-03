// Test de la lógica de estado automático. Ejecutar: npx tsx scripts/test-estado-proyecto.ts
import { computeEstadoProyecto, computeFlow, aplicarRetraso } from '../lib/utils/estado-proyecto';

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? 'OK  ' : 'XX  ') + m); c ? pass++ : fail++; };

// Proyecto nuevo, sin avance
ok(computeEstadoProyecto({}) === 'EN INGENIERÍA', 'vacío → EN INGENIERÍA');

// Planos aprobados → COMPRAS EN CURSO
ok(computeEstadoProyecto({ estadoPlanos: 'Aprobados' }) === 'COMPRAS EN CURSO', 'planos aprobados → COMPRAS EN CURSO');
ok(computeEstadoProyecto({ estadoPlanos: 'En revisión' }) === 'EN INGENIERÍA', 'planos en revisión → sigue EN INGENIERÍA');

// + materiales completos → EN PRODUCCIÓN
const matsOk = [{ estado: 'COMPLETO' }, { estado: 'COMPLETO' }];
const matsParcial = [{ estado: 'COMPLETO' }, { estado: 'PENDIENTE' }];
ok(computeEstadoProyecto({ estadoPlanos: 'Aprobados', materiales: matsOk }) === 'EN PRODUCCIÓN', 'planos+materiales → EN PRODUCCIÓN');
ok(computeEstadoProyecto({ estadoPlanos: 'Aprobados', materiales: matsParcial }) === 'COMPRAS EN CURSO', 'materiales parciales → sigue COMPRAS EN CURSO');

// + producción 100% → LISTO PARA PRUEBAS
const etapasOk = [{ estado: 'COMPLETADO' }, { estado: 'COMPLETADO' }];
const etapasParcial = [{ estado: 'COMPLETADO' }, { estado: 'PENDIENTE' }];
ok(computeEstadoProyecto({ estadoPlanos: 'Aprobados', materiales: matsOk, etapas: etapasOk }) === 'LISTO PARA PRUEBAS', 'producción 100% → LISTO PARA PRUEBAS');
ok(computeEstadoProyecto({ estadoPlanos: 'Aprobados', materiales: matsOk, etapas: etapasParcial }) === 'EN PRODUCCIÓN', 'producción parcial → sigue EN PRODUCCIÓN');

// + pruebas + envío → COMPLETADO
ok(computeEstadoProyecto({ estadoPlanos: 'Aprobados', materiales: matsOk, etapas: etapasOk, pruebas: true, envio: true }) === 'COMPLETADO', 'pruebas+envío → COMPLETADO');
ok(computeEstadoProyecto({ estadoPlanos: 'Aprobados', materiales: matsOk, etapas: etapasOk, pruebas: true, envio: false }) === 'LISTO PARA PRUEBAS', 'pruebas sin envío → sigue LISTO PARA PRUEBAS');

// No se puede saltar etapas: producción sin materiales no avanza
ok(computeEstadoProyecto({ estadoPlanos: 'Aprobados', materiales: matsParcial, etapas: etapasOk }) === 'COMPRAS EN CURSO', 'no salta etapas (producción sin materiales)');

// computeFlow acumulativo
const f = computeFlow({ estadoPlanos: 'Aprobados', materiales: matsOk, etapas: etapasOk, pruebas: true, envio: true });
ok(f.ingenieria && f.logistica && f.produccion && f.pruebas && f.completado, 'computeFlow: todas las etapas true al completar');

// --- RETRASADO (overlay por fecha) ---
ok(aplicarRetraso('EN PRODUCCIÓN', '2026-01-01', '2026-06-02') === 'RETRASADO', 'fecha vencida + no completado → RETRASADO');
ok(aplicarRetraso('EN PRODUCCIÓN', '2026-12-31', '2026-06-02') === 'EN PRODUCCIÓN', 'fecha futura → no retrasado');
ok(aplicarRetraso('COMPLETADO', '2026-01-01', '2026-06-02') === 'COMPLETADO', 'completado nunca es retrasado (aunque venza)');
ok(aplicarRetraso('EN INGENIERÍA', null, '2026-06-02') === 'EN INGENIERÍA', 'sin fecha de entrega → no retrasado');

console.log(`\n===== ${pass} OK / ${fail} fallos =====`);
process.exit(fail ? 1 : 0);
