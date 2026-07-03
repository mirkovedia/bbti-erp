import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// Healthcheck para Docker (docker-compose healthcheck) y monitoreo.
// Sin auth: no expone datos, solo estado.
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: 'OK', db: true, timestamp: new Date().toISOString() });
  } catch {
    return NextResponse.json(
      { status: 'ERROR', db: false, timestamp: new Date().toISOString() },
      { status: 503 }
    );
  }
}
