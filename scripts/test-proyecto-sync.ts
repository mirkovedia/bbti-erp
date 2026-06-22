// Test del secuenciador de actualizaciones del proyecto (anti last-writer-wins).
// Ejecutar: npx tsx scripts/test-proyecto-sync.ts
import { nextSyncToken, applyIfFresh, __resetSyncForTests } from '../lib/utils/proyecto-sync';

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { console.log((c ? 'OK  ' : 'XX  ') + m); c ? pass++ : fail++; };

// Caso 1: dos emisiones; la respuesta VIEJA (token A) llega DESPUÉS de la nueva (token B).
// La vieja NO debe pisar a la nueva.
__resetSyncForTests();
{
  let estado = 'inicial';
  const apply = (v: string) => { estado = v; };
  const tokenA = nextSyncToken(); // PATCH viejo (snapshot pre-confirmación)
  const tokenB = nextSyncToken(); // PATCH nuevo (con la confirmación)
  applyIfFresh(tokenB, 'NUEVO', apply); // B resuelve primero
  applyIfFresh(tokenA, 'VIEJO', apply); // A resuelve tarde → debe descartarse
  ok(estado === 'NUEVO', 'respuesta vieja que llega tarde NO pisa a la nueva');
}

// Caso 2: orden natural (A luego B) → gana B.
__resetSyncForTests();
{
  let estado = 'inicial';
  const apply = (v: string) => { estado = v; };
  const tokenA = nextSyncToken();
  const tokenB = nextSyncToken();
  applyIfFresh(tokenA, 'A', apply);
  applyIfFresh(tokenB, 'B', apply);
  ok(estado === 'B', 'orden natural → gana la emisión más nueva');
}

// Caso 3: una sola emisión se aplica siempre.
__resetSyncForTests();
{
  let estado = 'inicial';
  const t = nextSyncToken();
  applyIfFresh(t, 'unico', (v) => { estado = v; });
  ok(estado === 'unico', 'emisión única se aplica');
}

// Caso 4: update optimista (síncrono, token nuevo) gana a un PATCH viejo en vuelo.
__resetSyncForTests();
{
  let estado = 'inicial';
  const apply = (v: string) => { estado = v; };
  const tokenPatch = nextSyncToken();   // PATCH lanzado
  const tokenOptim = nextSyncToken();   // update optimista posterior
  applyIfFresh(tokenOptim, 'OPTIMISTA', apply); // optimista aplica ya
  applyIfFresh(tokenPatch, 'PATCH_VIEJO', apply); // el PATCH viejo resuelve después → descartado
  ok(estado === 'OPTIMISTA', 'update optimista no es pisado por un PATCH viejo');
}

console.log(`\n===== ${pass} OK / ${fail} fallos =====`);
process.exit(fail ? 1 : 0);
