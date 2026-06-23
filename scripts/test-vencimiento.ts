// Tests unitarios de las funciones puras de vencimiento.
import { clasificarVencimiento, mensajeVencimiento, diasDeDiferencia } from '../lib/utils/vencimiento';

let pass = 0, fail = 0;
const eq = (got: unknown, exp: unknown, msg: string) => {
  const ok = JSON.stringify(got) === JSON.stringify(exp);
  console.log((ok ? '✅ ' : `❌ (got ${JSON.stringify(got)}) `) + msg);
  ok ? pass++ : fail++;
};

// diasDeDiferencia
eq(diasDeDiferencia('2026-06-23', '2026-06-30'), 7, 'diasDeDiferencia 7 días adelante');
eq(diasDeDiferencia('2026-06-23', '2026-06-20'), -3, 'diasDeDiferencia 3 días atrás');
eq(diasDeDiferencia('2026-06-23', '2026-06-23'), 0, 'diasDeDiferencia mismo día = 0');

// clasificarVencimiento (diasAlerta = 7, hoy = 2026-06-23)
const HOY = '2026-06-23';
eq(clasificarVencimiento('2026-06-20', HOY, 7, 'EN PRODUCCIÓN'), 'retrasado', 'vencido → retrasado');
eq(clasificarVencimiento('2026-06-23', HOY, 7, 'EN PRODUCCIÓN'), 'por_vencer', 'vence hoy → por_vencer');
eq(clasificarVencimiento('2026-06-30', HOY, 7, 'EN PRODUCCIÓN'), 'por_vencer', 'justo en el umbral (hoy+7) → por_vencer');
eq(clasificarVencimiento('2026-07-01', HOY, 7, 'EN PRODUCCIÓN'), null, 'fuera del umbral → null');
eq(clasificarVencimiento('2026-06-20', HOY, 7, 'COMPLETADO'), null, 'completado nunca alerta');
eq(clasificarVencimiento(null, HOY, 7, 'EN PRODUCCIÓN'), null, 'sin fecha → null');

// mensajeVencimiento
eq(
  mensajeVencimiento('retrasado', 'PR-01-2026', 'ACME', 3, 'Compras'),
  'PR-01-2026 (ACME) está retrasado 3 día(s). Está en Compras.',
  'mensaje retrasado'
);
eq(
  mensajeVencimiento('por_vencer', 'PR-01-2026', 'ACME', 5, 'Ingeniería'),
  'PR-01-2026 (ACME) vence en 5 día(s). Está en Ingeniería.',
  'mensaje por_vencer'
);

console.log(`\n===== ${pass} OK / ${fail} fallos =====`);
process.exit(fail ? 1 : 0);
