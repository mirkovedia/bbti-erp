-- 002_harden_rls.sql
-- Endurece políticas RLS demasiado permisivas detectadas en la auditoría.
--
-- Problema: la política "auth_write_users" permitía a CUALQUIER usuario autenticado
-- escribir en la tabla `users`, habilitando escalada de privilegios
-- (un usuario podía cambiar su propio `rol` a 'Administrador' vía Supabase directo).
--
-- Las mutaciones legítimas de usuarios/config en el backend usan el cliente
-- service_role (admin), que BYPASEA RLS, por lo que estas políticas no afectan
-- el flujo normal de la aplicación.

-- ---------------------------------------------------------------------------
-- Helper: ¿el usuario actual es Administrador?
-- SECURITY DEFINER corre como el dueño de la función (ignora RLS), evitando la
-- recursión infinita que ocurriría al consultar `users` dentro de su propia
-- política. `stable` + search_path fijo por seguridad.
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and rol = 'Administrador'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- USERS: reemplaza la escritura abierta por una restringida a Administradores
-- (la lectura sigue permitida para autenticados vía "auth_read_users")
-- ---------------------------------------------------------------------------
drop policy if exists "auth_write_users" on users;

create policy "admin_insert_users" on users
  for insert with check (public.is_admin());

create policy "admin_update_users" on users
  for update using (public.is_admin()) with check (public.is_admin());

create policy "admin_delete_users" on users
  for delete using (public.is_admin());

-- ---------------------------------------------------------------------------
-- COMPANY_CONFIG: solo Administradores pueden escribir
-- (la lectura sigue permitida para autenticados vía "auth_read_config")
-- ---------------------------------------------------------------------------
drop policy if exists "auth_write_config" on company_config;

create policy "admin_write_config" on company_config
  for all using (public.is_admin()) with check (public.is_admin());
