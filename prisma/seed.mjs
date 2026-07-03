// Seed idempotente: usuarios demo, configuración de empresa y permisos por rol.
// Local:      npm run seed
// Contenedor: docker compose exec bbti-erp node prisma/seed.mjs
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const seedUsers = [
  { nombre: 'José Flores', email: 'jflores@bbti.com.pe', area: 'Comercial', rol: 'Comercial', password: 'jflores03' },
  { nombre: 'Néstor Ormeño', email: 'normeno@bbti.com.pe', area: 'Comercial', rol: 'Comercial', password: 'nestoro' },
  { nombre: 'Giancarlos Oscco', email: 'ingenieria@bbti.com.pe', area: 'Ingeniería', rol: 'Ingeniería', password: 'goscco' },
  { nombre: 'Carlos Ramírez', email: 'logistica@bbti.com.pe', area: 'Logística', rol: 'Logística', password: 'carlosr' },
  { nombre: 'Ana Torres', email: 'produccion@bbti.com.pe', area: 'Producción', rol: 'Producción', password: 'anat' },
  { nombre: 'Rosa Medina', email: 'finanzas@bbti.com.pe', area: 'Finanzas', rol: 'Finanzas', password: 'rosam' },
  { nombre: 'Admin Sistema', email: 'admin@bbti.com.pe', area: 'Administración', rol: 'Administrador', password: 'admin2024' },
];

// Misma matriz que lib/auth/permissions.ts (fuente: migración 011)
const seedPermissions = {
  Administrador: { canCreate: true, canEdit: true, canDelete: true, canManageUsers: true, canConfig: true, canViewReports: true, canViewFinance: true, canEditFinance: true, canEditProduccion: true, canEditLogistica: true, canEditIngenieria: true, canEditComercial: true, canExport: true },
  'Gerencia General': { canCreate: false, canEdit: false, canDelete: false, canManageUsers: false, canConfig: false, canViewReports: true, canViewFinance: true, canEditFinance: false, canEditProduccion: false, canEditLogistica: false, canEditIngenieria: false, canEditComercial: false, canExport: true },
  Comercial: { canCreate: true, canEdit: true, canDelete: true, canManageUsers: false, canConfig: false, canViewReports: true, canViewFinance: true, canEditFinance: false, canEditProduccion: false, canEditLogistica: false, canEditIngenieria: false, canEditComercial: true, canExport: true },
  'Ingeniería': { canCreate: true, canEdit: false, canDelete: true, canManageUsers: false, canConfig: false, canViewReports: false, canViewFinance: true, canEditFinance: false, canEditProduccion: false, canEditLogistica: false, canEditIngenieria: true, canEditComercial: false, canExport: true },
  'Logística': { canCreate: false, canEdit: false, canDelete: false, canManageUsers: false, canConfig: false, canViewReports: false, canViewFinance: true, canEditFinance: false, canEditProduccion: false, canEditLogistica: true, canEditIngenieria: false, canEditComercial: false, canExport: true },
  'Producción': { canCreate: false, canEdit: false, canDelete: false, canManageUsers: false, canConfig: false, canViewReports: false, canViewFinance: true, canEditFinance: false, canEditProduccion: true, canEditLogistica: false, canEditIngenieria: false, canEditComercial: false, canExport: false },
  Finanzas: { canCreate: false, canEdit: false, canDelete: false, canManageUsers: false, canConfig: false, canViewReports: true, canViewFinance: true, canEditFinance: true, canEditProduccion: false, canEditLogistica: false, canEditIngenieria: false, canEditComercial: false, canExport: true },
  'Solo Lectura': { canCreate: false, canEdit: false, canDelete: false, canManageUsers: false, canConfig: false, canViewReports: false, canViewFinance: true, canEditFinance: false, canEditProduccion: false, canEditLogistica: false, canEditIngenieria: false, canEditComercial: false, canExport: false },
};

async function main() {
  console.log('🌱 Seed BBTI ERP...');

  for (const u of seedUsers) {
    const password_hash = await bcrypt.hash(u.password, 10);
    await prisma.users.upsert({
      where: { email: u.email },
      update: {},
      create: { nombre: u.nombre, email: u.email, area: u.area, rol: u.rol, activo: true, password_hash },
    });
    console.log(`✅ ${u.nombre} (${u.rol})`);
  }

  const existing = await prisma.company_config.findFirst();
  if (!existing) {
    await prisma.company_config.create({
      data: { name: 'BBTI', siglas: 'S.A.C.', rubro: 'Fabricación de Tableros Eléctricos Industriales', moneda: 'S/', igv: '18', orden_prefix: 'PR', dias_alerta: 7 },
    });
    console.log('✅ company_config');
  }

  for (const [rol, permissions] of Object.entries(seedPermissions)) {
    await prisma.role_permissions.upsert({
      where: { rol },
      update: { permissions },
      create: { rol, permissions },
    });
  }
  console.log('✅ role_permissions (8 roles)');
  console.log('🎉 Seed completado.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
