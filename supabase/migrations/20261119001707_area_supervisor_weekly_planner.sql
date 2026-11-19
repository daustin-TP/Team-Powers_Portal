-- Live weekly planning workspace for Area Supervisors and administrators.
-- The weekly header mirrors the Director's checklist while individual visits
-- continue to use the existing private calendar and visit-log workflow.

create table if not exists public.supervisor_weekly_plans (
  id uuid primary key default gen_random_uuid(),
  supervisor_id uuid not null references public.profiles(id) on delete restrict,
  week_start date not null,
  regional_plan_id uuid references public.kpi_regional_plans(id) on delete set null,
  days_off text not null default '',
  hours_by_day jsonb not null default '{}'::jsonb,
  rush_shifts jsonb not null default '{}'::jsonb,
  top_priorities text not null default '',
  store_checklist jsonb not null default '{}'::jsonb,
  notes text not null default '',
  status text not null default 'live' check (status in ('live','complete')),
  created_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  updated_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supervisor_weekly_plans_monday_check check (extract(isodow from week_start) = 1),
  constraint supervisor_weekly_plans_unique_week unique (supervisor_id, week_start)
);

create index if not exists supervisor_weekly_plans_week_idx
  on public.supervisor_weekly_plans(week_start desc, supervisor_id);
create index if not exists supervisor_weekly_plans_regional_plan_idx
  on public.supervisor_weekly_plans(regional_plan_id) where regional_plan_id is not null;

alter table public.supervisor_weekly_plans enable row level security;
revoke all on public.supervisor_weekly_plans from anon;
grant select, insert, update on public.supervisor_weekly_plans to authenticated;
grant all on public.supervisor_weekly_plans to service_role;

drop policy if exists "leadership reads private weekly plans" on public.supervisor_weekly_plans;
create policy "leadership reads private weekly plans"
on public.supervisor_weekly_plans for select to authenticated
using (
  (select public.current_portal_role()) = 'admin'
  or (
    (select public.current_portal_role()) = 'supervisor'
    and supervisor_id = (select auth.uid())
  )
);

drop policy if exists "leadership creates private weekly plans" on public.supervisor_weekly_plans;
create policy "leadership creates private weekly plans"
on public.supervisor_weekly_plans for insert to authenticated
with check (
  created_by = (select auth.uid())
  and updated_by = (select auth.uid())
  and (
    (select public.current_portal_role()) = 'admin'
    or (
      (select public.current_portal_role()) = 'supervisor'
      and supervisor_id = (select auth.uid())
    )
  )
);

drop policy if exists "leadership updates private weekly plans" on public.supervisor_weekly_plans;
create policy "leadership updates private weekly plans"
on public.supervisor_weekly_plans for update to authenticated
using (
  (select public.current_portal_role()) = 'admin'
  or (
    (select public.current_portal_role()) = 'supervisor'
    and supervisor_id = (select auth.uid())
  )
)
with check (
  updated_by = (select auth.uid())
  and (
    (select public.current_portal_role()) = 'admin'
    or (
      (select public.current_portal_role()) = 'supervisor'
      and supervisor_id = (select auth.uid())
    )
  )
);

create table if not exists public.supervisor_weekly_plan_history (
  id uuid primary key default gen_random_uuid(),
  weekly_plan_id uuid not null references public.supervisor_weekly_plans(id) on delete cascade deferrable initially deferred,
  supervisor_id uuid not null references public.profiles(id) on delete restrict,
  changed_by uuid not null references public.profiles(id) on delete restrict,
  change_type text not null check (change_type in ('created','updated')),
  snapshot jsonb not null,
  changed_at timestamptz not null default now()
);

create index if not exists supervisor_weekly_plan_history_plan_idx
  on public.supervisor_weekly_plan_history(weekly_plan_id, changed_at desc);

alter table public.supervisor_weekly_plan_history enable row level security;
revoke all on public.supervisor_weekly_plan_history from anon;
grant select on public.supervisor_weekly_plan_history to authenticated;
grant all on public.supervisor_weekly_plan_history to service_role;

drop policy if exists "leadership reads private weekly plan history" on public.supervisor_weekly_plan_history;
create policy "leadership reads private weekly plan history"
on public.supervisor_weekly_plan_history for select to authenticated
using (
  (select public.current_portal_role()) = 'admin'
  or (
    (select public.current_portal_role()) = 'supervisor'
    and supervisor_id = (select auth.uid())
  )
);

create or replace function public.audit_supervisor_weekly_plan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  insert into public.supervisor_weekly_plan_history
    (weekly_plan_id, supervisor_id, changed_by, change_type, snapshot)
  values
    (new.id, new.supervisor_id, new.updated_by,
     case when tg_op = 'INSERT' then 'created' else 'updated' end,
     to_jsonb(new));
  return new;
end;
$$;

revoke all on function public.audit_supervisor_weekly_plan() from public, anon, authenticated;

drop trigger if exists audit_supervisor_weekly_plan_trigger on public.supervisor_weekly_plans;
create trigger audit_supervisor_weekly_plan_trigger
before insert or update on public.supervisor_weekly_plans
for each row execute function public.audit_supervisor_weekly_plan();

alter table public.supervisor_visit_schedules
  add column if not exists weekly_plan_id uuid references public.supervisor_weekly_plans(id) on delete set null;

create index if not exists supervisor_visit_schedules_weekly_plan_idx
  on public.supervisor_visit_schedules(weekly_plan_id, visit_date, start_time);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'supervisor_weekly_plans'
  ) then
    alter publication supabase_realtime add table public.supervisor_weekly_plans;
  end if;
end $$;
