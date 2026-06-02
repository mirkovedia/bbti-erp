// Test del parser de metrado contra el Excel real.
// Ejecutar: npx tsx scripts/test-parse-metrado.ts
import * as XLSX from 'xlsx';
import { parseMetrado } from '../lib/utils/parse-metrado';

let pass = 0;
let fail = 0;
const ok = (cond: boolean, msg: string) => {
  console.log((cond ? 'OK  ' : 'XX  ') + msg);
  cond ? pass++ : fail++;
};

const wb = XLSX.readFile('metrado.xlsx');
const { materiales, warnings } = parseMetrado(wb);

console.log(`Detectados: ${materiales.length} materiales, ${warnings.length} warnings`);
if (warnings.length) warnings.forEach((w) => console.log('  warn:', w));

ok(materiales.length === 112, `112 materiales (obtenido ${materiales.length})`);

const primero = materiales[0];
console.log('Primer material:', JSON.stringify(primero));
ok(primero?.codigo === '1.01', `primer código = 1.01 (obtenido ${primero?.codigo})`);
ok(/CAJA CON SOPORTE 01/i.test(primero?.nombre ?? ''), 'primer nombre contiene "CAJA CON SOPORTE 01"');
ok(primero?.cantidad === 8, `primera cantidad = 8 (obtenido ${primero?.cantidad})`);
ok(Math.abs((primero?.precio_unitario ?? 0) - 8840.09) < 0.5, `primer precio ≈ 8840.09 (obtenido ${primero?.precio_unitario})`);

ok(materiales.every((m) => m.cantidad > 0), 'todas las cantidades > 0 (ninguna fila de categoría)');
ok(materiales.every((m) => m.nombre.trim().length > 0), 'todos tienen nombre');
ok(materiales.every((m) => m.unidad === 'und' && m.estado === 'PENDIENTE' && m.comprado === 0), 'defaults correctos (und/PENDIENTE/0)');

console.log(`\n===== ${pass} OK / ${fail} fallos =====`);
process.exit(fail ? 1 : 0);
