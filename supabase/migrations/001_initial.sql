-- BBTI ERP - Migración inicial
-- Ejecutar en Supabase SQL Editor

-- COMPANY CONFIG
create table if not exists company_config (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'BBTI',
  siglas text default 'S.A.C.',
  rubro text default 'Fabricación de Tableros Eléctricos',
  ruc text,
  direccion text,
  telefono text,
  email text,
  website text,
  moneda text default 'S/',
  igv text default '18',
  orden_prefix text default 'OC',
  updated_at timestamptz default now()
);

-- USERS (extends Supabase Auth)
create table if not exists users (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null,
  email text not null unique,
  area text not null,
  rol text not null,
  activo boolean default true,
  created_at timestamptz default now()
);

-- PROYECTOS (órdenes)
create table if not exists proyectos (
  id text primary key,
  cliente text not null,
  fecha_creacion date not null,
  monto numeric(12,2) default 0,
  usuario_id uuid references users(id),
  usuario_nombre text,
  estado text not null default 'EN INGENIERÍA',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- COMERCIAL
create table if not exists proyecto_comercial (
  id uuid primary key default gen_random_uuid(),
  proyecto_id text references proyectos(id) on delete cascade unique,
  fecha_entrega date,
  dias_plazo int,
  adelanto numeric(12,2) default 0,
  adelanto_fijado boolean default false,
  metrado text,
  alerta text,
  updated_at timestamptz default now()
);

-- INGENIERÍA
create table if not exists proyecto_ingenieria (
  id uuid primary key default gen_random_uuid(),
  proyecto_id text references proyectos(id) on delete cascade unique,
  estado_planos text default 'Solicitud de planos',
  updated_at timestamptz default now()
);

-- LOGÍSTICA — materiales
create table if not exists proyecto_materiales (
  id uuid primary key default gen_random_uuid(),
  proyecto_id text references proyectos(id) on delete cascade,
  nombre text not null,
  cantidad int default 0,
  unidad text default 'und',
  comprado int default 0,
  estado text default 'PENDIENTE'
);

-- PRODUCCIÓN
create table if not exists proyecto_produccion (
  id uuid primary key default gen_random_uuid(),
  proyecto_id text references proyectos(id) on delete cascade unique,
  progreso int default 0,
  pruebas boolean default false,
  envio boolean default false,
  updated_at timestamptz default now()
);

-- ETAPAS DE PRODUCCIÓN
create table if not exists proyecto_etapas (
  id uuid primary key default gen_random_uuid(),
  proyecto_id text references proyectos(id) on delete cascade,
  nombre text not null,
  orden int not null,
  estado text default 'PENDIENTE'
);

-- FINANZAS
create table if not exists proyecto_finanzas (
  id uuid primary key default gen_random_uuid(),
  proyecto_id text references proyectos(id) on delete cascade unique,
  adelanto numeric(12,2) default 0,
  fecha_adelanto date,
  porcentaje int default 0,
  forma_pago text,
  alerta text,
  updated_at timestamptz default now()
);

-- PAGOS ADICIONALES
create table if not exists proyecto_pagos (
  id uuid primary key default gen_random_uuid(),
  proyecto_id text references proyectos(id) on delete cascade,
  descripcion text,
  monto numeric(12,2),
  fecha date,
  created_at timestamptz default now()
);

-- COMENTARIOS (Comercial)
create table if not exists proyecto_comentarios (
  id uuid primary key default gen_random_uuid(),
  proyecto_id text references proyectos(id) on delete cascade,
  autor text not null,
  texto text not null,
  fecha date not null,
  created_at timestamptz default now()
);

-- OBSERVACIONES (Ingeniería)
create table if not exists proyecto_observaciones (
  id uuid primary key default gen_random_uuid(),
  proyecto_id text references proyectos(id) on delete cascade,
  autor text not null,
  texto text not null,
  fecha date not null,
  created_at timestamptz default now()
);

-- DOCUMENTOS (archivos)
create table if not exists proyecto_documentos (
  id uuid primary key default gen_random_uuid(),
  proyecto_id text references proyectos(id) on delete cascade,
  nombre text not null,
  tipo text,
  storage_path text,
  subido_por text,
  created_at timestamptz default now()
);

-- ALERTAS DEL SISTEMA
create table if not exists alertas (
  id uuid primary key default gen_random_uuid(),
  proyecto_id text references proyectos(id) on delete cascade,
  tipo text,
  mensaje text not null,
  leida boolean default false,
  created_at timestamptz default now()
);

-- INDEXES
create index if not exists idx_proyectos_estado on proyectos(estado);
create index if not exists idx_proyectos_usuario on proyectos(usuario_id);
create index if not exists idx_materiales_proyecto on proyecto_materiales(proyecto_id);
create index if not exists idx_etapas_proyecto on proyecto_etapas(proyecto_id);
create index if not exists idx_alertas_proyecto on alertas(proyecto_id);
create index if not exists idx_alertas_leida on alertas(leida);

-- RLS POLICIES
alter table proyectos enable row level security;
alter table users enable row level security;
alter table alertas enable row level security;
alter table proyecto_comercial enable row level security;
alter table proyecto_ingenieria enable row level security;
alter table proyecto_materiales enable row level security;
alter table proyecto_produccion enable row level security;
alter table proyecto_etapas enable row level security;
alter table proyecto_finanzas enable row level security;
alter table proyecto_pagos enable row level security;
alter table proyecto_comentarios enable row level security;
alter table proyecto_observaciones enable row level security;
alter table proyecto_documentos enable row level security;
alter table company_config enable row level security;

-- Políticas: usuarios autenticados pueden leer todo
create policy "auth_read_proyectos" on proyectos for select using (auth.role() = 'authenticated');
create policy "auth_read_users" on users for select using (auth.role() = 'authenticated');
create policy "auth_read_alertas" on alertas for select using (auth.role() = 'authenticated');
create policy "auth_read_comercial" on proyecto_comercial for select using (auth.role() = 'authenticated');
create policy "auth_read_ingenieria" on proyecto_ingenieria for select using (auth.role() = 'authenticated');
create policy "auth_read_materiales" on proyecto_materiales for select using (auth.role() = 'authenticated');
create policy "auth_read_produccion" on proyecto_produccion for select using (auth.role() = 'authenticated');
create policy "auth_read_etapas" on proyecto_etapas for select using (auth.role() = 'authenticated');
create policy "auth_read_finanzas" on proyecto_finanzas for select using (auth.role() = 'authenticated');
create policy "auth_read_pagos" on proyecto_pagos for select using (auth.role() = 'authenticated');
create policy "auth_read_comentarios" on proyecto_comentarios for select using (auth.role() = 'authenticated');
create policy "auth_read_observaciones" on proyecto_observaciones for select using (auth.role() = 'authenticated');
create policy "auth_read_documentos" on proyecto_documentos for select using (auth.role() = 'authenticated');
create policy "auth_read_config" on company_config for select using (auth.role() = 'authenticated');

-- Políticas de escritura: usuarios autenticados pueden insertar/actualizar
create policy "auth_insert_proyectos" on proyectos for insert with check (auth.role() = 'authenticated');
create policy "auth_update_proyectos" on proyectos for update using (auth.role() = 'authenticated');
create policy "auth_delete_proyectos" on proyectos for delete using (auth.role() = 'authenticated');

create policy "auth_write_comercial" on proyecto_comercial for all using (auth.role() = 'authenticated');
create policy "auth_write_ingenieria" on proyecto_ingenieria for all using (auth.role() = 'authenticated');
create policy "auth_write_materiales" on proyecto_materiales for all using (auth.role() = 'authenticated');
create policy "auth_write_produccion" on proyecto_produccion for all using (auth.role() = 'authenticated');
create policy "auth_write_etapas" on proyecto_etapas for all using (auth.role() = 'authenticated');
create policy "auth_write_finanzas" on proyecto_finanzas for all using (auth.role() = 'authenticated');
create policy "auth_write_pagos" on proyecto_pagos for all using (auth.role() = 'authenticated');
create policy "auth_write_comentarios" on proyecto_comentarios for all using (auth.role() = 'authenticated');
create policy "auth_write_observaciones" on proyecto_observaciones for all using (auth.role() = 'authenticated');
create policy "auth_write_documentos" on proyecto_documentos for all using (auth.role() = 'authenticated');
create policy "auth_write_alertas" on alertas for all using (auth.role() = 'authenticated');
create policy "auth_write_config" on company_config for all using (auth.role() = 'authenticated');
create policy "auth_write_users" on users for all using (auth.role() = 'authenticated');

-- Insert default company config
insert into company_config (name, siglas, rubro, moneda, igv, orden_prefix)
values ('BBTI', 'S.A.C.', 'Fabricación de Tableros Eléctricos Industriales', 'S/', '18', 'PR')
on conflict do nothing;
