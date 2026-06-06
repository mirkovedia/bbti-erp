-- 006_notificaciones.sql
-- Notificaciones por eventos. Fan-out: una fila por usuario destinatario.
-- El estado del proyecto / alertas por fecha NO se tocan; esto es el registro de eventos.

create table if not exists notificaciones (
  id              uuid primary key default gen_random_uuid(),
  destinatario_id uuid not null references users(id) on delete cascade,
  proyecto_id     text references proyectos(id) on delete cascade,
  tipo            text not null,   -- 'documento' | 'confirmacion' | 'datos' | 'hito'
  mensaje         text not null,
  actor           text,
  leida           boolean default false,
  created_at      timestamptz default now()
);
create index if not exists idx_notificaciones_destinatario
  on notificaciones(destinatario_id, leida);

alter table notificaciones enable row level security;

-- ÚNICA política: cada usuario VE solo lo suyo (esta misma regla filtra el Realtime).
-- No hay políticas de escritura: todo lo escribe el backend con service role (bypasea RLS).
create policy "read_own_notificaciones" on notificaciones
  for select using (destinatario_id = auth.uid());

-- Habilitar tiempo real en la tabla
alter publication supabase_realtime add table notificaciones;
