// scripts/test-command-center.mjs
import { serviceClient } from './lib/supabase-test.mjs';

const supabase = serviceClient();

async function run() {
  console.log('--- Iniciando Test Real de Command Center ---');
  
  const testLogs = [
    {
      proyecto_id: 'PR-03',
      cliente: 'Corporación Aceros S.A.',
      usuario: 'José Flores',
      rol: 'Comercial',
      accion: 'metrado',
      detalle: 'importó metrado de Excel para PR-03 (S/ 120,000)'
    },
    {
      proyecto_id: 'PR-02',
      cliente: 'Construcciones Metálicas del Perú',
      usuario: 'Giancarlos Oscco',
      rol: 'Ingeniería',
      accion: 'firma',
      detalle: 'aprobó planos para PR-02'
    },
    {
      proyecto_id: 'PR-02',
      cliente: 'Construcciones Metálicas del Perú',
      usuario: 'Carlos Ramírez',
      rol: 'Logística',
      accion: 'compras',
      detalle: 'completó la compra de materiales para PR-02'
    },
    {
      proyecto_id: 'PR-01',
      cliente: 'Minería del Sur S.A.C.',
      usuario: 'Mirko Baron',
      rol: 'Gerencia General',
      accion: 'pago',
      detalle: 'aprobó el pago del 50% de adelanto para PR-01'
    }
  ];

  console.log('Insertando actividades de prueba en la base de datos Supabase...');
  
  const { data, error } = await supabase
    .from('actividad_log')
    .insert(testLogs)
    .select();

  if (error) {
    console.error('Error al insertar actividades en Supabase:', error);
  } else {
    console.log('¡Actividades de prueba creadas con éxito!');
    data.forEach((log) => {
      console.log(`[${log.rol}] ${log.usuario}: ${log.detalle} (${log.proyecto_id})`);
    });
  }
}

run();
