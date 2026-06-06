// Test de la lógica de confirmaciones de etapa. Ejecutar: npx tsx scripts/test-flujo-confirmaciones.ts
import {
  computeReadiness,
  computeEstadoFromConfirmaciones,
  cascadeEtapas,
  computeFlujoRows,
} from '../lib/utils/estado-proyecto';

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? 'OK  ' : 'XX  ') + m); c ? pass++ : fail++; };

const docAprob = [{ estado: 'Aprobados y firmados' }];
const matsOk = [{ estado: 'COMPLETO' }, { estado: 'COMPLETO' }];
const matsParcial = [{ estado: 'COMPLETO' }, { estado: 'PENDIENTE' }];
const etapasOk = [{ estado: 'COMPLETADO' }, { estado: 'COMPLETADO' }];

// --- computeReadiness ---
// Ingeniería lista solo si hay un plano aprobado
ok(computeReadiness({ documentos: docAprob }).ingenieria === true, 'plano aprobado → ingeniería lista');
ok(computeReadiness({ documentos: [{ estado: 'En proceso' }] }).ingenieria === false, 'plano en proceso → ingeniería NO lista');

// Logística NO lista si ingeniería no está firmada, aunque materiales COMPLETO
ok(computeReadiness({ documentos: docAprob, materiales: matsOk }).logistica === false,
  'materiales OK pero ingeniería sin firmar → logística NO lista');
// Logística lista si ingeniería firmada y materiales COMPLETO
ok(computeReadiness({ confirmaciones: [{ etapa: 'ingenieria' }], materiales: matsOk }).logistica === true,
  'ingeniería firmada + materiales OK → logística lista');
// Logística NO lista si materiales a medias
ok(computeReadiness({ confirmaciones: [{ etapa: 'ingenieria' }], materiales: matsParcial }).logistica === false,
  'ingeniería firmada + materiales parciales → logística NO lista');

// Producción lista si logística firmada y etapas COMPLETADO
ok(computeReadiness({ confirmaciones: [{ etapa: 'logistica' }], etapas: etapasOk }).produccion === true,
  'logística firmada + etapas OK → producción lista');

// Pruebas lista en cuanto producción firmada (sin condición de datos)
ok(computeReadiness({ confirmaciones: [{ etapa: 'produccion' }] }).pruebas === true,
  'producción firmada → pruebas lista');
// Completado lista en cuanto pruebas firmada
ok(computeReadiness({ confirmaciones: [{ etapa: 'pruebas' }] }).completado === true,
  'pruebas firmada → completado lista');

// --- computeEstadoFromConfirmaciones ---
ok(computeEstadoFromConfirmaciones(new Set()) === 'EN INGENIERÍA', 'sin firmas → EN INGENIERÍA');
ok(computeEstadoFromConfirmaciones(new Set(['ingenieria'])) === 'COMPRAS EN CURSO', 'ingeniería → COMPRAS EN CURSO');
ok(computeEstadoFromConfirmaciones(new Set(['ingenieria', 'logistica'])) === 'EN PRODUCCIÓN', 'logística → EN PRODUCCIÓN');
ok(computeEstadoFromConfirmaciones(new Set(['ingenieria', 'logistica', 'produccion'])) === 'LISTO PARA PRUEBAS', 'producción → LISTO PARA PRUEBAS');
ok(computeEstadoFromConfirmaciones(new Set(['ingenieria', 'logistica', 'produccion', 'pruebas'])) === 'LISTO PARA PRUEBAS', 'pruebas → sigue LISTO PARA PRUEBAS');
ok(computeEstadoFromConfirmaciones(new Set(['ingenieria', 'logistica', 'produccion', 'pruebas', 'completado'])) === 'COMPLETADO', 'completado → COMPLETADO');

// --- cascadeEtapas ---
ok(JSON.stringify(cascadeEtapas('logistica')) === JSON.stringify(['logistica', 'produccion', 'pruebas', 'completado']),
  'cascada de logística incluye posteriores');
ok(JSON.stringify(cascadeEtapas('completado')) === JSON.stringify(['completado']), 'cascada de completado es solo ella');

// --- computeFlujoRows ---
const rows = computeFlujoRows({
  confirmaciones: [{ etapa: 'ingenieria', confirmada_por: 'Juan', confirmada_at: '2026-06-01' }],
  materiales: matsParcial,
});
ok(rows[0].status === 'confirmada' && rows[0].confirmadaPor === 'Juan', 'fila ingeniería confirmada con autor');
ok(rows[1].status === 'faltan_datos', 'logística: ingeniería firmada + materiales parciales → faltan_datos');
ok(rows[2].status === 'esperando', 'producción: logística sin firmar → esperando');

console.log(`\n===== ${pass} OK / ${fail} fallos =====`);
process.exit(fail ? 1 : 0);
