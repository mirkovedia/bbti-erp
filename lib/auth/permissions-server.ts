import { prisma } from '@/lib/db';
import { PERMS } from '@/lib/auth/permissions';
import type { Rol, Permissions } from '@/types';

// Permisos dinámicos desde BD con fallback a la matriz estática.
// Vive en archivo aparte porque lib/auth/permissions.ts se importa desde
// componentes client (usa Zustand) y no puede arrastrar Prisma al bundle.
export const getRolePermissionsServer = async (): Promise<Record<Rol, Permissions>> => {
  try {
    const data = await prisma.role_permissions.findMany({ select: { rol: true, permissions: true } });
    if (data.length === 0) return PERMS;
    const map = {} as Record<Rol, Permissions>;
    for (const r of data) {
      map[r.rol as Rol] = r.permissions as unknown as Permissions;
    }
    for (const r of Object.keys(PERMS) as Rol[]) {
      if (!map[r]) map[r] = PERMS[r];
    }
    return map;
  } catch {
    return PERMS;
  }
};
