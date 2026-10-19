-- Audience-aware Team Powers events plus private supervisor visit schedules.

alter table public.labor_scheduling_events
  add column if not exists audience text not null default 'leadership'
  check (audience in ('everyone', 'leadership', 'supervisors', 'admin'));

drop policy if exists "leaders read scheduling events" on public.labor_scheduling_events;
create policy "audiences read scheduling events"
on public.labor_scheduling_events for select to authenticated
using (
  ((scope = 'company') or public.can_access_store(store_id))
  and case audience
    when 'everyone' then (select public.current_portal_role()) is not null
    when 'leadership' then (select public.current_portal_role()) in ('manager', 'supervisor', 'admin')
    when 'supervisors' then (select public.current_portal_role()) in ('supervisor', 'admin')
    when 'admin' then (select public.current_portal_role()) = 'admin'
    else false
  end
);

grant select on public.labor_scheduling_events to authenticated;

create table if not exists public.supervisor_visit_schedules (
  id uuid primary key default gen_random_uuid(),
  supervisor_id uuid not null references public.profiles(id) on delete restrict,
  store_id uuid not null references public.stores(id) on delete restrict,
  visit_date date not null,
  start_time time not null,
  end_time time not null,
  purpose text not null check (length(btrim(purpose)) between 1 and 120),
  notes text,
  status text not null default 'tentative' check (status in ('tentative', 'confirmed', 'cancelled')),
  created_by uuid not null references auth.users(id) on delete restrict default auth.uid(),
  updated_by uuid not null references auth.users(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supervisor_visit_time_check check (end_time > start_time)
);

create index if not exists supervisor_visit_schedules_supervisor_date_idx
  on public.supervisor_visit_schedules(supervisor_id, visit_date, start_time);
create index if not exists supervisor_visit_schedules_date_idx
  on public.supervisor_visit_schedules(visit_date, start_time);

alter table public.supervisor_visit_schedules enable row level security;

drop policy if exists "supervisors read private visit schedules" on public.supervisor_visit_schedules;
create policy "supervisors read private visit schedules"
on public.supervisor_visit_schedules for select to authenticated
using (
  (select public.current_portal_role()) = 'admin'
  or supervisor_id = (select auth.uid())
);

drop policy if exists "supervisors create private visit schedules" on public.supervisor_visit_schedules;
create policy "supervisors create private visit schedules"
on public.supervisor_visit_schedules for insert to authenticated
with check (
  created_by = (select auth.uid())
  and updated_by = (select auth.uid())
  and (
    ((select public.current_portal_role()) = 'supervisor' and supervisor_id = (select auth.uid()))
    or (select public.current_portal_role()) = 'admin'
  )
);

drop policy if exists "supervisors update private visit schedules" on public.supervisor_visit_schedules;
create policy "supervisors update private visit schedules"
on public.supervisor_visit_schedules for update to authenticated
using (
  (select public.current_portal_role()) = 'admin'
  or ((select public.current_portal_role()) = 'supervisor' and supervisor_id = (select auth.uid()))
)
with check (
  updated_by = (select auth.uid())
  and (
    (select public.current_portal_role()) = 'admin'
    or ((select public.current_portal_role()) = 'supervisor' and supervisor_id = (select auth.uid()))
  )
);

drop policy if exists "supervisors delete private visit schedules" on public.supervisor_visit_schedules;
create policy "supervisors delete private visit schedules"
on public.supervisor_visit_schedules for delete to authenticated
using (
  (select public.current_portal_role()) = 'admin'
  or ((select public.current_portal_role()) = 'supervisor' and supervisor_id = (select auth.uid()))
);

revoke all on public.supervisor_visit_schedules from anon;
grant select, insert, update, delete on public.supervisor_visit_schedules to authenticated;
grant all on public.supervisor_visit_schedules to service_role;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'supervisor_visit_schedules'
  ) then
    alter publication supabase_realtime add table public.supervisor_visit_schedules;
  end if;
end $$;
