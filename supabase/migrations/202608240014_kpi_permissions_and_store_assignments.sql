-- DASH SOS KPI access, multi-store assignments, and audit support.
-- Safe to run again after a partial or completed attempt.

create table if not exists public.profile_store_assignments (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  assigned_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key (profile_id, store_id)
);

create table if not exists public.profile_permissions (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  permission text not null check (
    permission in ('kpi_view', 'kpi_edit_goals', 'kpi_view_all')
  ),
  granted_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key (profile_id, permission)
);

alter table public.profile_store_assignments enable row level security;
alter table public.profile_permissions enable row level security;

drop policy if exists "users read own store assignments" on public.profile_store_assignments;
create policy "users read own store assignments"
on public.profile_store_assignments for select to authenticated
using (
  profile_id = auth.uid()
  or public.current_portal_role() = 'admin'
);

drop policy if exists "admins manage store assignments" on public.profile_store_assignments;
create policy "admins manage store assignments"
on public.profile_store_assignments for all to authenticated
using (public.current_portal_role() = 'admin')
with check (public.current_portal_role() = 'admin');

drop policy if exists "users read own portal permissions" on public.profile_permissions;
create policy "users read own portal permissions"
on public.profile_permissions for select to authenticated
using (
  profile_id = auth.uid()
  or public.current_portal_role() = 'admin'
);

drop policy if exists "admins manage portal permissions" on public.profile_permissions;
create policy "admins manage portal permissions"
on public.profile_permissions for all to authenticated
using (public.current_portal_role() = 'admin')
with check (public.current_portal_role() = 'admin');

-- Preserve each user's existing primary store as their first assignment.
insert into public.profile_store_assignments (profile_id, store_id)
select id, store_id
from public.profiles
where store_id is not null
on conflict (profile_id, store_id) do nothing;

-- Supervisors receive the first KPI access layer. Administrators are handled
-- as an unrestricted special case by the server function.
insert into public.profile_permissions (profile_id, permission)
select id, permission
from public.profiles
cross join (
  values ('kpi_view'), ('kpi_edit_goals'), ('kpi_view_all')
) as seeded_permissions(permission)
where role = 'supervisor' and active = true
on conflict (profile_id, permission) do nothing;

-- New supervisors automatically start with company, supervisor-group, and
-- store views. If they later move to another role, those defaults are removed
-- so an administrator can grant only the exceptions that are still needed.
create or replace function public.sync_default_kpi_permissions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'supervisor' then
    insert into public.profile_permissions (profile_id, permission)
    values
      (new.id, 'kpi_view'),
      (new.id, 'kpi_edit_goals'),
      (new.id, 'kpi_view_all')
    on conflict (profile_id, permission) do nothing;
  elsif tg_op = 'UPDATE' and old.role = 'supervisor' and new.role <> 'supervisor' then
    delete from public.profile_permissions
    where profile_id = new.id
      and permission in ('kpi_view', 'kpi_edit_goals', 'kpi_view_all');
  end if;
  return new;
end;
$$;

drop trigger if exists sync_default_kpi_permissions_trigger on public.profiles;
create trigger sync_default_kpi_permissions_trigger
after insert or update of role on public.profiles
for each row execute function public.sync_default_kpi_permissions();

create index if not exists profile_store_assignments_store_idx
  on public.profile_store_assignments(store_id);
create index if not exists profile_permissions_permission_idx
  on public.profile_permissions(permission);
