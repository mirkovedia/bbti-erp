import { create } from 'zustand';
import { User, Permissions, Rol } from '@/types';

interface AppState {
  user: User | null;
  sidebarCollapsed: boolean;
  mobileSidebarOpen: boolean;
  rolePermissions: Record<Rol, Permissions> | null;
  moneda: string;
  igv: number;
  setUser: (user: User | null) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setMobileSidebarOpen: (open: boolean) => void;
  setRolePermissions: (rolePermissions: Record<Rol, Permissions> | null) => void;
  setCompanyConfig: (moneda: string, igv: number) => void;
}

export const useAppStore = create<AppState>((set) => ({
  user: null,
  sidebarCollapsed: false,
  mobileSidebarOpen: false,
  rolePermissions: null,
  moneda: 'S/',
  igv: 18,
  setUser: (user) => set({ user }),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),
  setRolePermissions: (rolePermissions) => set({ rolePermissions }),
  setCompanyConfig: (moneda, igv) => set({ moneda, igv }),
}));
