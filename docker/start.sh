#!/bin/sh
set -e
echo "Aplicando migraciones de base de datos..."
node /opt/prisma-cli/node_modules/prisma/build/index.js migrate deploy --schema prisma/schema.prisma
echo "Iniciando BBTI ERP..."
exec node server.js
