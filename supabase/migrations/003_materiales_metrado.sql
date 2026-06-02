-- 003_materiales_metrado.sql
-- Enriquece proyecto_materiales para soportar el metrado importado desde Excel:
-- código de ítem (ej. "1.01") y precio unitario de la cotización.

alter table proyecto_materiales
  add column if not exists codigo text,
  add column if not exists precio_unitario numeric(12,2) default 0;
