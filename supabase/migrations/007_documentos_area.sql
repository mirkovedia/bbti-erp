-- 007_documentos_area.sql
-- Trazabilidad: registra el rol/área del usuario que subió cada documento,
-- capturado en el momento de la subida (foto histórica, para transparencia/auditoría).
alter table proyecto_documentos
  add column if not exists subido_por_rol text;
