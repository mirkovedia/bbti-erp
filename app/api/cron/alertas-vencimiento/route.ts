import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  computeEstadoFromConfirmaciones,
  FLOW_ETAPAS,
  ETAPA_LABEL,
  type EtapaFlujo,
} from '@/lib/utils/estado-proyecto';
import { rolDelAreaDeEtapa, notificar } from '@/lib/notificaciones';
import { clasificarVencimiento, mensajeVencimiento, diasDeDiferencia } from '@/lib/utils/vencimiento';

export async function GET(req: NextRequest) {
  // El sidecar cron (docker/cron) envía "Authorization: Bearer <CRON_SECRET>".
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    // Fecha de hoy en zona America/Lima (UTC-5, sin horario de verano).
    const hoy = new Date(Date.now() - 5 * 3_600_000).toISOString().split('T')[0];

    const cfg = await prisma.company_config.findFirst({ select: { dias_alerta: true } });
    const diasAlerta = Number(cfg?.dias_alerta) || 7;

    const proyectos = await prisma.proyectos.findMany({
      select: {
        id: true,
        cliente: true,
        activo: true,
        comercial: { select: { fecha_entrega: true } },
        confirmaciones: { select: { etapa: true } },
      },
    });

    const yaEnviadas = await prisma.proyecto_alertas_enviadas.findMany({
      select: { proyecto_id: true, tipo: true },
    });
    const enviadasSet = new Set(yaEnviadas.map((r) => `${r.proyecto_id}:${r.tipo}`));

    const vigentes = new Set<string>();
    const detalle: { id: string; tipo: string }[] = [];
    let avisados = 0;

    for (const p of proyectos) {
      if (p.activo === false) continue;
      const fechaEntrega = p.comercial?.fecha_entrega ?? null;
      const confirmadas = new Set<EtapaFlujo>(p.confirmaciones.map((c) => c.etapa as EtapaFlujo));
      const estado = computeEstadoFromConfirmaciones(confirmadas);
      const tipo = clasificarVencimiento(fechaEntrega, hoy, diasAlerta, estado);
      if (!tipo) continue;

      const key = `${p.id}:${tipo}`;
      vigentes.add(key);
      if (enviadasSet.has(key)) continue;

      const etapa = FLOW_ETAPAS.find((e) => !confirmadas.has(e)) ?? 'completado';
      const dias = Math.abs(diasDeDiferencia(hoy, fechaEntrega as string));
      await notificar({
        proyectoId: p.id,
        tipo: 'vencimiento',
        mensaje: mensajeVencimiento(tipo, p.id, p.cliente ?? '', dias, ETAPA_LABEL[etapa]),
        rolesDestino: [rolDelAreaDeEtapa(etapa)],
        actorNombre: 'Sistema',
      });
      await prisma.proyecto_alertas_enviadas.create({ data: { proyecto_id: p.id, tipo } });
      avisados++;
      detalle.push({ id: p.id, tipo });
    }

    // Housekeeping: borrar dedups que ya no aplican (rearma la alerta futura)
    for (const r of yaEnviadas) {
      if (!vigentes.has(`${r.proyecto_id}:${r.tipo}`)) {
        await prisma.proyecto_alertas_enviadas.deleteMany({
          where: { proyecto_id: r.proyecto_id, tipo: r.tipo },
        });
      }
    }

    return NextResponse.json({ revisados: proyectos.length, avisados, detalle });
  } catch (err) {
    console.error('cron alertas-vencimiento error:', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
