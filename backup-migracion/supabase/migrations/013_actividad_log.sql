-- 013_actividad_log.sql
-- Bitácora de actividad general del sistema ERP (Command Center Feed)
create table if not exists actividad_log (
  id           uuid primary key default gen_random_uuid(),
  proyecto_id  text,               -- ID del proyecto (ej: PR-01)
  cliente      text,               -- Nombre del cliente desnormalizado para sobrevivir a borrados
  usuario      text not null,      -- Nombre de la persona que realizó la acción
  rol          text not null,      -- Rol de la persona
  accion       text not null,      -- Tipo de acción (creacion, edicion, eliminacion, metrado, firma, compras, etc.)
  detalle      text not null,      -- Mensaje descriptivo legible (ej: "Aprobó planos de Ingeniería")
  created_at   timestamptz default now()
);

create index if not exists idx_actividad_log_fecha on actividad_log(created_at desc);

alter table actividad_log enable row level security;

-- Lectura para todos los usuarios autenticados
create policy "auth_read_actividad_log" on actividad_log
  for select using (auth.role() = 'authenticated');
