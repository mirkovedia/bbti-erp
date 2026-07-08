-- 004_documentos_estado.sql
-- Cada documento (versión de plano) tiene su propio estado del flujo de planos:
-- Solicitados por comercial → En proceso → Enviados a comercial → Aprobados y firmados.
-- NULL = sin estado (recién subido; el usuario lo elige).

alter table proyecto_documentos
  add column if not exists estado text;
