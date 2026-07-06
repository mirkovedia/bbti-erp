#!/bin/sh
# BusyBox crond NO hereda el entorno del contenedor en los jobs:
# generamos el crontab con el secreto ya interpolado al arrancar.
# 13:00 UTC = 08:00 America/Lima (sin horario de verano).
echo "0 13 * * * curl -fsS -H \"Authorization: Bearer ${CRON_SECRET}\" http://bbti-erp:3000/api/cron/alertas-vencimiento >> /proc/1/fd/1 2>&1" > /etc/crontabs/root
exec crond -f -l 8
