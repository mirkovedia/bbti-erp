// Test de enrutamiento de notificaciones. Ejecutar: npx tsx scripts/test-notificaciones.ts
import { rolesParaConfirmacion, mensajeConfirmacion, rolDelAreaDeEtapa } from '../lib/notificaciones';

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? 'OK  ' : 'XX  ') + m); c ? pass++ : fail++; };
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// rolesParaConfirmacion
ok(eq(rolesParaConfirmacion('ingenieria'), ['Logística']), 'ingeniería → Logística');
ok(eq(rolesParaConfirmacion('logistica'), ['Producción']), 'logística → Producción');
ok(eq(rolesParaConfirmacion('produccion'), ['Comercial', 'Gerencia General']), 'producción → Comercial+Gerencia');
ok(eq(rolesParaConfirmacion('pruebas'), ['Comercial', 'Gerencia General']), 'pruebas → Comercial+Gerencia');
ok(eq(rolesParaConfirmacion('completado'), ['Comercial', 'Finanzas', 'Gerencia General']), 'completado → Comercial+Finanzas+Gerencia');

// rolDelAreaDeEtapa
ok(rolDelAreaDeEtapa('ingenieria') === 'Ingeniería', 'área de ingeniería → Ingeniería');
ok(rolDelAreaDeEtapa('logistica') === 'Logística', 'área de logística → Logística');
ok(rolDelAreaDeEtapa('produccion') === 'Producción', 'área de producción → Producción');

// mensajeConfirmacion
ok(mensajeConfirmacion('ingenieria', 'PR-01-2026').includes('PR-01-2026'), 'mensaje incluye el id');
ok(/plano/i.test(mensajeConfirmacion('ingenieria', 'PR-01-2026')), 'mensaje de ingeniería habla de planos');
ok(/complet/i.test(mensajeConfirmacion('completado', 'PR-01-2026')), 'mensaje de completado habla de completado');

console.log(`\n===== ${pass} OK / ${fail} fallos =====`);
process.exit(fail ? 1 : 0);
