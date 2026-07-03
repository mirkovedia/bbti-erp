import { PrismaClient } from '@prisma/client';

// Singleton: en dev el hot-reload re-evalúa módulos; guardamos la instancia
// en globalThis para no agotar conexiones.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
