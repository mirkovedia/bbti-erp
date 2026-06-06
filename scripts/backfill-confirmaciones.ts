// Backfill: infiere las firmas de etapa de proyectos existentes desde su avance actual.
// Ejecutar: npx tsx --env-file=.env.local scripts/backfill-confirmaciones.ts
import { serviceClient } from './lib/supabase-test.mjs';
import { computeFlow, computeEstadoFromConfirmaciones, type EtapaFlujo } from '../lib/utils/estado-proyecto';

const AUTOR = 'Sistema (migración)';

const main = async () => {
  const svc = serviceClient();
  const { data: proyectos, error } = await svc.from('proyectos').select('id');
  if (error) { console.error(error.message); process.exit(1); }

  let total = 0, firmasInsertadas = 0;
  for (const { id } of proyectos ?? []) {
    total++;
    const [docs, mats, etps, prod] = await Promise.all([
      svc.from('proyecto_documentos').select('estado').eq('proyecto_id', id),
      svc.from('proyecto_materiales').select('estado').eq('proyecto_id', id),
      svc.from('proyecto_etapas').select('estado').eq('proyecto_id', id),
      svc.from('proyecto_produccion').select('pruebas, envio').eq('proyecto_id', id).maybeSingle(),
    ]);
    const flow = computeFlow({
      documentos: docs.data ?? [],
      materiales: mats.data ?? [],
      etapas: etps.data ?? [],
      pruebas: prod.data?.pruebas,
      envio: prod.data?.envio,
    });
    const firmadas: EtapaFlujo[] = [];
    if (flow.ingenieria) firmadas.push('ingenieria');
    if (flow.logistica) firmadas.push('logistica');
    if (flow.produccion) firmadas.push('produccion');
    if (flow.pruebas) firmadas.push('pruebas');
    if (flow.completado) firmadas.push('completado');

    if (firmadas.length > 0) {
      const rows = firmadas.map((etapa) => ({ proyecto_id: id, etapa, confirmada_por: AUTOR }));
      await svc.from('proyecto_confirmaciones').upsert(rows, { onConflict: 'proyecto_id,etapa' });
      firmasInsertadas += firmadas.length;
    }
    // Persistir el estado derivado de las firmas
    const estado = computeEstadoFromConfirmaciones(new Set(firmadas));
    await svc.from('proyectos').update({ estado }).eq('id', id);
    console.log(`${id}: [${firmadas.join(', ') || 'ninguna'}] → ${estado}`);
  }
  console.log(`\n${total} proyectos procesados, ${firmasInsertadas} firmas insertadas.`);
  process.exit(0);
};

main();
