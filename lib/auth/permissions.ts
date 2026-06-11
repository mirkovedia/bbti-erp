import { Rol, Permissions, User } from '@/types';
import { DOC_PREFIX } from '@/lib/constants';
import { useAppStore } from '@/store/appStore';

export const PERMS: Record<Rol, Permissions> = {
  Administrador: {
    canCreate: true, canEdit: true, canDelete: true, canManageUsers: true,
    canConfig: true, canViewReports: true, canViewFinance: true, canEditFinance: true,
    canEditProduccion: true, canEditLogistica: true, canEditIngenieria: true,
    canEditComercial: true, canExport: true,
  },
  'Gerencia General': {
    canCreate: false, canEdit: false, canDelete: false, canManageUsers: false,
    canConfig: false, canViewReports: true, canViewFinance: true, canEditFinance: false,
    canEditProduccion: false, canEditLogistica: false, canEditIngenieria: false,
    canEditComercial: false, canExport: true,
  },
  Comercial: {
    canCreate: true, canEdit: true, canDelete: true, canManageUsers: false,
    canConfig: false, canViewReports: true, canViewFinance: true, canEditFinance: false,
    canEditProduccion: false, canEditLogistica: false, canEditIngenieria: false,
    canEditComercial: true, canExport: true,
  },
  Ingeniería: {
    canCreate: true, canEdit: false, canDelete: true, canManageUsers: false,
    canConfig: false, canViewReports: false, canViewFinance: true, canEditFinance: false,
    canEditProduccion: false, canEditLogistica: false, canEditIngenieria: true,
    canEditComercial: false, canExport: true,
  },
  Logística: {
    canCreate: false, canEdit: false, canDelete: false, canManageUsers: false,
    canConfig: false, canViewReports: false, canViewFinance: true, canEditFinance: false,
    canEditProduccion: false, canEditLogistica: true, canEditIngenieria: false,
    canEditComercial: false, canExport: true,
  },
  Producción: {
    canCreate: false, canEdit: false, canDelete: false, canManageUsers: false,
    canConfig: false, canViewReports: false, canViewFinance: true, canEditFinance: false,
    canEditProduccion: true, canEditLogistica: false, canEditIngenieria: false,
    canEditComercial: false, canExport: false,
  },
  Finanzas: {
    canCreate: false, canEdit: false, canDelete: false, canManageUsers: false,
    canConfig: false, canViewReports: true, canViewFinance: true, canEditFinance: true,
    canEditProduccion: false, canEditLogistica: false, canEditIngenieria: false,
    canEditComercial: false, canExport: true,
  },
  'Solo Lectura': {
    canCreate: false, canEdit: false, canDelete: false, canManageUsers: false,
    canConfig: false, canViewReports: false, canViewFinance: true, canEditFinance: false,
    canEditProduccion: false, canEditLogistica: false, canEditIngenieria: false,
    canEditComercial: false, canExport: false,
  },
};

export const can = (user: User | null, perm: keyof Permissions): boolean => {
  if (!user) return false;
  
  // Intenta leer los permisos dinámicos desde Zustand
  const dynamicPerms = useAppStore.getState().rolePermissions;
  if (dynamicPerms && dynamicPerms[user.rol]) {
    return dynamicPerms[user.rol]?.[perm] ?? false;
  }
  
  // Fallback a los estáticos en el código
  return PERMS[user.rol]?.[perm] ?? false;
};

export const checkUploadPermission = (
  userRole: Rol,
  filename: string,
  permsMap?: Record<Rol, Permissions>
): boolean => {
  const dummyUser = { rol: userRole } as User;
  
  const lookup = (perm: keyof Permissions) => {
    if (permsMap && permsMap[userRole]) {
      return permsMap[userRole]?.[perm] ?? false;
    }
    return can(dummyUser, perm);
  };
  
  if (
    filename.startsWith(DOC_PREFIX.oc) || 
    filename.startsWith(DOC_PREFIX.especificaciones) || 
    filename.startsWith(DOC_PREFIX.comprobante)
  ) {
    return lookup('canEditComercial');
  }
  
  if (filename.startsWith(DOC_PREFIX.despiece)) {
    return lookup('canEditIngenieria');
  }
  
  return lookup('canEditIngenieria');
};

// Carga los permisos dinámicos desde la BD en el lado del servidor
export const getRolePermissionsServer = async (supabase: any): Promise<Record<Rol, Permissions>> => {
  try {
    const { data, error } = await supabase.from('role_permissions').select('rol, permissions');
    if (error || !data || data.length === 0) {
      return PERMS;
    }
    const map = {} as Record<Rol, Permissions>;
    for (const r of data) {
      map[r.rol as Rol] = r.permissions as Permissions;
    }
    // Asegurar que todos los roles conocidos estén en el mapa, rellenando con PERMS si faltan
    for (const r of Object.keys(PERMS) as Rol[]) {
      if (!map[r]) {
        map[r] = PERMS[r];
      }
    }
    return map;
  } catch {
    return PERMS;
  }
};
