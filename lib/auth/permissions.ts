import { Rol, Permissions, User } from '@/types';

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
    canCreate: true, canEdit: true, canDelete: false, canManageUsers: false,
    canConfig: false, canViewReports: true, canViewFinance: false, canEditFinance: false,
    canEditProduccion: false, canEditLogistica: false, canEditIngenieria: false,
    canEditComercial: true, canExport: true,
  },
  Ingeniería: {
    canCreate: false, canEdit: false, canDelete: false, canManageUsers: false,
    canConfig: false, canViewReports: false, canViewFinance: false, canEditFinance: false,
    canEditProduccion: false, canEditLogistica: false, canEditIngenieria: true,
    canEditComercial: false, canExport: true,
  },
  Logística: {
    canCreate: false, canEdit: false, canDelete: false, canManageUsers: false,
    canConfig: false, canViewReports: false, canViewFinance: false, canEditFinance: false,
    canEditProduccion: false, canEditLogistica: true, canEditIngenieria: false,
    canEditComercial: false, canExport: true,
  },
  Producción: {
    canCreate: false, canEdit: false, canDelete: false, canManageUsers: false,
    canConfig: false, canViewReports: false, canViewFinance: false, canEditFinance: false,
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
    canConfig: false, canViewReports: false, canViewFinance: false, canEditFinance: false,
    canEditProduccion: false, canEditLogistica: false, canEditIngenieria: false,
    canEditComercial: false, canExport: false,
  },
};

export const can = (user: User | null, perm: keyof Permissions): boolean => {
  if (!user) return false;
  return PERMS[user.rol]?.[perm] ?? false;
};
