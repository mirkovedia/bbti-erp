/**
 * Script de seed para BBTI ERP
 * Ejecutar con: npx tsx scripts/seed.ts
 * Requiere SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.local
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Error: Se requiere NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const seedUsers = [
  { nombre: 'José Flores', email: 'jflores@bbti.com.pe', area: 'Comercial', rol: 'Comercial', password: 'jflores03' },
  { nombre: 'Néstor Ormeño', email: 'normeno@bbti.com.pe', area: 'Comercial', rol: 'Comercial', password: 'nestoro' },
  { nombre: 'Giancarlos Oscco', email: 'ingenieria@bbti.com.pe', area: 'Ingeniería', rol: 'Ingeniería', password: 'goscco' },
  { nombre: 'Carlos Ramírez', email: 'logistica@bbti.com.pe', area: 'Logística', rol: 'Logística', password: 'carlosr' },
  { nombre: 'Ana Torres', email: 'produccion@bbti.com.pe', area: 'Producción', rol: 'Producción', password: 'anat' },
  { nombre: 'Rosa Medina', email: 'finanzas@bbti.com.pe', area: 'Finanzas', rol: 'Finanzas', password: 'rosam' },
  { nombre: 'Admin Sistema', email: 'admin@bbti.com.pe', area: 'Administración', rol: 'Administrador', password: 'admin2024' },
];

async function seed() {
  console.log('🌱 Iniciando seed de usuarios...\n');

  for (const user of seedUsers) {
    // Crear usuario en auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: user.email,
      password: user.password,
      email_confirm: true,
    });

    if (authError) {
      if (authError.message.includes('already been registered')) {
        console.log(`⚠️  ${user.email} ya existe, omitiendo...`);
        continue;
      }
      console.error(`❌ Error creando auth para ${user.email}:`, authError.message);
      continue;
    }

    // Insertar en tabla users
    const { error: dbError } = await supabase.from('users').insert({
      id: authData.user.id,
      nombre: user.nombre,
      email: user.email,
      area: user.area,
      rol: user.rol,
      activo: true,
    });

    if (dbError) {
      console.error(`❌ Error insertando user ${user.email}:`, dbError.message);
      continue;
    }

    console.log(`✅ ${user.nombre} (${user.rol}) — ${user.email}`);
  }

  console.log('\n🎉 Seed completado.');
}

seed().catch(console.error);
