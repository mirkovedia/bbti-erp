// Test del parser de metrado contra el Excel real.
// Ejecutar: npx tsx scripts/test-parse-metrado.ts
import * as XLSX from 'xlsx';
import { parseMetradoSheet, listSheetsWithMateriales, suggestSheet } from '../lib/utils/parse-metrado';

let pass = 0;
let fail = 0;
const ok = (cond: boolean, msg: string) => {
  console.log((cond ? 'OK  ' : 'XX  ') + msg);
  cond ? pass++ : fail++;
};

const wb = XLSX.readFile('metrado.xlsx');

// --- Listado de hojas con materiales ---
const sheets = listSheetsWithMateriales(wb);
console.log('Hojas con materiales:', sheets.map((s) => `${s.name}(${s.count})`).join(', '));
ok(sheets.some((s) => s.name === 'COT'), 'lista incluye COT');
ok(sheets.some((s) => s.name === 'Precios Equipos'), 'lista incluye Precios Equipos');
ok(suggestSheet(sheets) === 'Precios Equipos', `sugiere Precios Equipos (obtenido ${suggestSheet(sheets)})`);

// --- Hoja Precios Equipos (la correcta para Logística) ---
const eq = parseMetradoSheet(wb, 'Precios Equipos');
console.log(`\nPrecios Equipos: ${eq.materiales.length} materiales`);
const prim = eq.materiales[0];
console.log('Primer equipo:', JSON.stringify(prim));
ok(eq.materiales.length > 60 && eq.materiales.length < 90, `Precios Equipos da ~73 materiales (obtenido ${eq.materiales.length})`);
ok(/ITM 2x16A/i.test(prim?.nombre ?? ''), 'primer equipo es "ITM 2x16A..." (interruptor, no tablero)');
ok(prim?.cantidad === 20, `primera cantidad = 20 (obtenido ${prim?.cantidad})`);
ok(prim?.precio_unitario === 117, `primer precio = 117 (obtenido ${prim?.precio_unitario})`);
ok(eq.materiales.every((m) => m.cantidad > 0), 'todas las cantidades > 0');
ok(!eq.materiales.some((m) => /SUB ?TOTAL|TOTAL EQUIPOS/i.test(m.nombre)), 'no incluye filas de total');
ok(!eq.materiales.some((m) => /^TABLERO /i.test(m.nombre)), 'NO incluye tableros (esos están en COT)');

// --- Hoja COT sigue funcionando (retrocompat) ---
const cot = parseMetradoSheet(wb, 'COT');
ok(cot.materiales.length === 112, `COT sigue dando 112 (obtenido ${cot.materiales.length})`);

console.log(`\n===== ${pass} OK / ${fail} fallos =====`);
process.exit(fail ? 1 : 0);
