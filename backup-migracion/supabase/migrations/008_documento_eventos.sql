-- 008_documento_eventos.sql
-- Bitácora de actividad de documentos (auditoría/transparencia): quién subió,
-- descargó o eliminó cada documento, con su área y la hora exacta.
-- SIN claves foráneas con cascada a propósito: el evento debe SOBREVIVIR al borrado
-- del documento/proyecto (por eso el nombre del doc va desnormalizado aquí).
create table if not exists documento_eventos (
  id                uuid primary key default gen_random_uuid(),
  documento_id      uuid,
  proyecto_id       text,
  documento_nombre  text not null,
  tipo              text not null check (tipo in ('subida','descarga','eliminacion')),
  usuario           text,
  rol               text,
  created_at        timestamptz default now()
);
create index if not exists idx_documento_eventos_fecha on documento_eventos(created_at desc);

alter table documento_eventos enable row level security;
-- Lectura para autenticados (transparencia); escritura solo backend (service role).
create policy "auth_read_documento_eventos" on documento_eventos
  for select using (auth.role() = 'authenticated');
