-- Create role_permissions table
create table if not exists role_permissions (
  rol text primary key,
  permissions jsonb not null,
  updated_at timestamptz default now()
);

-- Enable RLS
alter table role_permissions enable row level security;

-- Policy: authenticated users can read permissions
create policy "auth_users_read_role_permissions" on role_permissions
  for select using (auth.role() = 'authenticated');

-- Policy: only Admin can write/update permissions
create policy "admin_all_role_permissions" on role_permissions
  for all using (
    exists (
      select 1 from users
      where id = auth.uid()
      and rol = 'Administrador'
    )
  );

-- Seed default permissions
insert into role_permissions (rol, permissions) values
  ('Administrador', '{"canCreate":true,"canEdit":true,"canDelete":true,"canManageUsers":true,"canConfig":true,"canViewReports":true,"canViewFinance":true,"canEditFinance":true,"canEditProduccion":true,"canEditLogistica":true,"canEditIngenieria":true,"canEditComercial":true,"canExport":true}'),
  ('Gerencia General', '{"canCreate":false,"canEdit":false,"canDelete":false,"canManageUsers":false,"canConfig":false,"canViewReports":true,"canViewFinance":true,"canEditFinance":false,"canEditProduccion":false,"canEditLogistica":false,"canEditIngenieria":false,"canEditComercial":false,"canExport":true}'),
  ('Comercial', '{"canCreate":true,"canEdit":true,"canDelete":true,"canManageUsers":false,"canConfig":false,"canViewReports":true,"canViewFinance":true,"canEditFinance":false,"canEditProduccion":false,"canEditLogistica":false,"canEditIngenieria":false,"canEditComercial":true,"canExport":true}'),
  ('Ingeniería', '{"canCreate":true,"canEdit":false,"canDelete":true,"canManageUsers":false,"canConfig":false,"canViewReports":false,"canViewFinance":true,"canEditFinance":false,"canEditProduccion":false,"canEditLogistica":false,"canEditIngenieria":true,"canEditComercial":false,"canExport":true}'),
  ('Logística', '{"canCreate":false,"canEdit":false,"canDelete":false,"canManageUsers":false,"canConfig":false,"canViewReports":false,"canViewFinance":true,"canEditFinance":false,"canEditProduccion":false,"canEditLogistica":true,"canEditIngenieria":false,"canEditComercial":false,"canExport":true}'),
  ('Producción', '{"canCreate":false,"canEdit":false,"canDelete":false,"canManageUsers":false,"canConfig":false,"canViewReports":false,"canViewFinance":true,"canEditFinance":false,"canEditProduccion":true,"canEditLogistica":false,"canEditIngenieria":false,"canEditComercial":false,"canExport":false}'),
  ('Finanzas', '{"canCreate":false,"canEdit":false,"canDelete":false,"canManageUsers":false,"canConfig":false,"canViewReports":true,"canViewFinance":true,"canEditFinance":true,"canEditProduccion":false,"canEditLogistica":false,"canEditIngenieria":false,"canEditComercial":false,"canExport":true}'),
  ('Solo Lectura', '{"canCreate":false,"canEdit":false,"canDelete":false,"canManageUsers":false,"canConfig":false,"canViewReports":false,"canViewFinance":true,"canEditFinance":false,"canEditProduccion":false,"canEditLogistica":false,"canEditIngenieria":false,"canEditComercial":false,"canExport":false}')
on conflict (rol) do update set permissions = excluded.permissions;
