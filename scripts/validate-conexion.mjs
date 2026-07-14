// scripts/validate-conexion.mjs
// Valida el acceso a la base de datos (AWS RDS) SIN imprimir credenciales:
// conexión/autenticación, base, schema objetivo, tablas migradas y permisos
// de CREATE (lo que necesita `prisma migrate deploy`).
//
// Uso:  node --env-file=.env.production scripts/validate-conexion.mjs
import { PrismaClient } from '@prisma/client';

const url = process.env.DATABASE_URL || '';
if (!url) {
  console.error('✖ DATABASE_URL no está definido (¿corriste con --env-file=.env.production?)');
  process.exit(1);
}

const parsed = new URL(url);
const schema = parsed.searchParams.get('schema') || 'public';
console.log(`Host:            ${parsed.hostname}`);
console.log(`Base de datos:   ${parsed.pathname.slice(1)}`);
console.log(`Schema objetivo: ${schema}`);
console.log('');

const prisma = new PrismaClient();
let fallos = 0;

try {
  const [{ version }] = await prisma.$queryRaw`SELECT version() AS version`;
  console.log('✔ Conexión y autenticación OK —', String(version).split(' on ')[0]);

  const [{ ssl }] = await prisma.$queryRaw`SHOW ssl`.catch(() => [{ ssl: 'desconocido' }]);
  console.log(`✔ SSL del servidor: ${ssl}`);

  const existeSchema = await prisma.$queryRaw`
    SELECT 1 FROM information_schema.schemata WHERE schema_name = ${schema}`;
  if (existeSchema.length > 0) {
    console.log(`✔ El schema "${schema}" existe`);
  } else {
    console.log(`⚠ El schema "${schema}" NO existe todavía — probando si podemos crearlo...`);
    await prisma.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    console.log(`✔ Schema "${schema}" creado (permiso CREATE en la base confirmado)`);
  }

  const [{ n }] = await prisma.$queryRaw`
    SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = ${schema}`;
  if (n > 0) {
    console.log(`✔ El schema tiene ${n} tablas (¿migraciones ya aplicadas?)`);
  } else {
    console.log('ℹ Schema vacío — pendiente correr: prisma migrate deploy + seed');
  }

  // Permiso de CREATE/DROP dentro del schema (lo usa migrate deploy)
  await prisma.$executeRawUnsafe(`CREATE TABLE "${schema}"."_test_acceso_bbti" (id int)`);
  await prisma.$executeRawUnsafe(`DROP TABLE "${schema}"."_test_acceso_bbti"`);
  console.log('✔ Permisos CREATE/DROP de tablas en el schema OK (suficiente para prisma migrate deploy)');

  console.log('\n===== ACCESO VALIDADO: todo OK =====');
} catch (err) {
  fallos++;
  const msg = err?.message || String(err);
  if (msg.includes('P1001') || msg.includes("Can't reach")) {
    console.error('✖ No se pudo alcanzar el servidor (¿security group / IP no permitida?)');
  } else if (msg.includes('P1000') || msg.includes('Authentication failed')) {
    console.error('✖ Autenticación rechazada (usuario/clave incorrectos — ojo con caracteres especiales sin URL-encodear)');
  } else if (msg.includes('P1003') || msg.includes('does not exist')) {
    console.error('✖ La base de datos indicada no existe:', msg.split('\n')[0]);
  } else if (msg.includes('permission denied')) {
    console.error('✖ Conexión OK pero SIN permisos suficientes:', msg.split('\n')[0]);
  } else {
    console.error('✖ Error:', msg.split('\n').slice(0, 3).join(' '));
  }
  console.log('\n===== ACCESO CON PROBLEMAS: revisar arriba =====');
} finally {
  await prisma.$disconnect();
  process.exit(fallos > 0 ? 1 : 0);
}
