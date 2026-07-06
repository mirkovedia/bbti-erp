import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const data = await prisma.company_config.findFirst();
    return NextResponse.json(data ?? {});
  } catch (err) {
    console.error('GET /api/configuracion error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const solicitante = await prisma.users.findUnique({ where: { id: session.sub }, select: { rol: true } });
    if (solicitante?.rol !== 'Administrador') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    const body = await request.json();
    const fields = ['name', 'siglas', 'rubro', 'ruc', 'direccion', 'telefono', 'email', 'website', 'moneda', 'igv', 'orden_prefix', 'dias_alerta'];
    const updates: Record<string, unknown> = { updated_at: new Date() };
    for (const f of fields) {
      if (body[f] === undefined) continue;
      if (f === 'dias_alerta') {
        // Int? en Prisma: castear y rechazar valores no numéricos con 400
        if (body[f] === '' || body[f] === null) {
          updates[f] = null;
        } else {
          const n = Number(body[f]);
          if (!Number.isFinite(n)) {
            return NextResponse.json({ error: 'dias_alerta debe ser un número' }, { status: 400 });
          }
          updates[f] = Math.trunc(n);
        }
      } else {
        updates[f] = body[f];
      }
    }

    const existing = await prisma.company_config.findFirst({ select: { id: true } });
    // updates se arma con whitelist de campos; cast por el Record<string, unknown>
    const data = existing
      ? await prisma.company_config.update({
          where: { id: existing.id },
          data: updates as Prisma.company_configUncheckedUpdateInput,
        })
      : await prisma.company_config.create({
          data: updates as Prisma.company_configUncheckedCreateInput,
        });

    return NextResponse.json(data);
  } catch (err) {
    console.error('PATCH /api/configuracion error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
