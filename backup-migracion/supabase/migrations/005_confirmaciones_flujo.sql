-- 005_confirmaciones_flujo.sql
-- Confirmación manual (sign-off) de cada etapa del flujo. Una fila = una etapa firmada.
-- Ausencia de fila = etapa no firmada. El estado del proyecto se deriva de estas filas.

create table if not exists proyecto_confirmaciones (
  proyecto_id    text not null references proyectos(id) on delete cascade,
  etapa          text not null check (etapa in
                   ('ingenieria','logistica','produccion','pruebas','completado')),
  confirmada_por text,
  confirmada_at  timestamptz not null default now(),
  primary key (proyecto_id, etapa)
);

alter table proyecto_confirmaciones enable row level security;

-- Lectura para autenticados; escritura para autenticados (el backend usa service role).
create policy "auth_read_confirmaciones" on proyecto_confirmaciones
  for select using (auth.role() = 'authenticated');
create policy "auth_write_confirmaciones" on proyecto_confirmaciones
  for all using (auth.role() = 'authenticated');
