-- 010_soft_delete_proyectos.sql
-- Borrado suave (papelera): los proyectos ya NO se eliminan físicamente, se marcan
-- como inactivos para poder restaurarlos. Evita pérdidas accidentales de PRs.
alter table proyectos add column if not exists activo boolean not null default true;
create index if not exists idx_proyectos_activo on proyectos(activo);
