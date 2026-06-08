-- 009_indices_rendimiento.sql
-- Índices en proyecto_id para las sub-tablas que NO los tenían (las que sí son
-- "unique" o PK ya estaban indexadas). Aceleran la lectura del detalle del proyecto
-- (que consulta todas estas tablas por proyecto_id) cuando haya muchos proyectos.
create index if not exists idx_etapas_proyecto on proyecto_etapas(proyecto_id);
create index if not exists idx_pagos_proyecto on proyecto_pagos(proyecto_id);
create index if not exists idx_comentarios_proyecto on proyecto_comentarios(proyecto_id);
create index if not exists idx_observaciones_proyecto on proyecto_observaciones(proyecto_id);
create index if not exists idx_documentos_proyecto on proyecto_documentos(proyecto_id);
