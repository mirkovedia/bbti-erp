import { NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getSessionUser } from '@/lib/auth/session-user';

// Whitelist tipada de la configuración editable. dias_alerta: entero 0-365
// (z.coerce acepta el string del formulario), ''/null → null.
const texto = z.string().max(300).optional();
const configSchema = z
  .object({
    name: texto,
    siglas: texto,
    rubro: texto,
    ruc: texto,
    direccion: texto,
    telefono: texto,
    email: texto,
    website: texto,
    moneda: z.string().max(10).optional(),
    igv: texto,
    orden_prefix: z.string().max(10).optional(),
    dias_alerta: z.preprocess(
      (v) => (v === '' || v === null ? null : v),
      z.coerce.number().int().min(0).max(365).nullable().optional()
    ),
  }); // sin .strict(): las claves desconocidas se DESCARTAN (paridad con el whitelist previo)

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const data = await prisma.company_config.findFirst();
    return NextResponse.json(data ?? {});
  } catch (err) {
    console.error('GET /api/configuracion error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    if (user.rol !== 'Administrador') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    const parsed = configSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos de configuración inválidos', details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const updates: Record<string, unknown> = { updated_at: new Date() };
    for (const [k, v] of Object.entries(parsed.data)) {
      if (v !== undefined) updates[k] = v;
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
