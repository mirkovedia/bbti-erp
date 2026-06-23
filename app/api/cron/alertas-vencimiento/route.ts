import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  computeEstadoFromConfirmaciones,
  FLOW_ETAPAS,
  ETAPA_LABEL,
  type EtapaFlujo,
} from '@/lib/utils/estado-proyecto';
import { rolDelAreaDeEtapa, notificar } from '@/lib/notificaciones';
import { clasificarVencimiento, mensajeVencimiento, diasDeDiferencia } from '@/lib/utils/vencimiento';

// Normaliza el embed de Supabase (objeto cuando la FK es única, array si no).
const one = (v: unknown) => (Array.isArray(v) ? v[0] ?? null : v ?? null);

export async function GET(req: NextRequest) {
  // Vercel Cron inyecta automáticamente "Authorization: Bearer <CRON_SECRET>".
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    // Fecha de hoy en zona America/Lima (UTC-5, sin horario de verano).
    const hoy = new Date(Date.now() - 5 * 3_600_000).toISOString().split('T')[0];

    const { data: cfg } = await admin.from('company_config').select('dias_alerta').maybeSingle();
    const diasAlerta = Number(cfg?.dias_alerta) || 7;

    const { data: proyectos } = await admin
      .from('proyectos')
      .select('id, cliente, activo, proyecto_comercial(fecha_entrega), proyecto_confirmaciones(etapa)');

    const { data: yaEnviadas } = await admin
      .from('proyecto_alertas_enviadas')
      .select('proyecto_id, tipo');
    const enviadasSet = new Set((yaEnviadas ?? []).map((r) => `${r.proyecto_id}:${r.tipo}`));

    const vigentes = new Set<string>(); // claves que aplican hoy (para housekeeping)
    const detalle: { id: string; tipo: string }[] = [];
    let avisados = 0;

    for (const p of proyectos ?? []) {
      if (p.activo === false) continue;
      const comercial = one(p.proyecto_comercial) as { fecha_entrega?: string | null } | null;
      const fechaEntrega = comercial?.fecha_entrega ?? null;
      const confirmaciones = Array.isArray(p.proyecto_confirmaciones) ? p.proyecto_confirmaciones : [];
      const confirmadas = new Set<EtapaFlujo>(
        confirmaciones.map((c: { etapa: string }) => c.etapa as EtapaFlujo)
      );
      const estado = computeEstadoFromConfirmaciones(confirmadas);
      const tipo = clasificarVencimiento(fechaEntrega, hoy, diasAlerta, estado);
      if (!tipo) continue;

      const key = `${p.id}:${tipo}`;
      vigentes.add(key);
      if (enviadasSet.has(key)) continue; // ya se avisó este cruce

      const etapa = FLOW_ETAPAS.find((e) => !confirmadas.has(e)) ?? 'completado';
      const dias = Math.abs(diasDeDiferencia(hoy, fechaEntrega as string));
      await notificar({
        proyectoId: p.id,
        tipo: 'vencimiento',
        mensaje: mensajeVencimiento(tipo, p.id, p.cliente ?? '', dias, ETAPA_LABEL[etapa]),
        rolesDestino: [rolDelAreaDeEtapa(etapa)],
        actorNombre: 'Sistema',
      });
      await admin.from('proyecto_alertas_enviadas').insert({ proyecto_id: p.id, tipo });
      avisados++;
      detalle.push({ id: p.id, tipo });
    }

    // Housekeeping: borrar filas dedup que ya no aplican (reprogramados a futuro,
    // completados o eliminados) → permite re-alertar si el proyecto vuelve a cruzar.
    for (const r of yaEnviadas ?? []) {
      if (!vigentes.has(`${r.proyecto_id}:${r.tipo}`)) {
        await admin
          .from('proyecto_alertas_enviadas')
          .delete()
          .eq('proyecto_id', r.proyecto_id)
          .eq('tipo', r.tipo);
      }
    }

    return NextResponse.json({ revisados: (proyectos ?? []).length, avisados, detalle });
  } catch (err) {
    console.error('cron alertas-vencimiento error:', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
