-- Memoria de alertas de vencimiento ya enviadas (comportamiento edge-triggered:
-- un aviso por cruce de estado). El unique evita duplicados.
create table if not exists proyecto_alertas_enviadas (
  id          bigint generated always as identity primary key,
  proyecto_id text not null references proyectos(id) on delete cascade,
  tipo        text not null check (tipo in ('por_vencer', 'retrasado')),
  enviada_at  timestamptz not null default now(),
  unique (proyecto_id, tipo)
);

alter table proyecto_alertas_enviadas enable row level security;
-- Sin políticas públicas: solo el backend (service role) escribe/lee. El service
-- role bypassa RLS, así que no hace falta ninguna policy.
