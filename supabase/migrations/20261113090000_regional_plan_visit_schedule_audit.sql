-- Connect Area Supervisor visit schedules to KPI regional plans and retain an audit trail.

alter table public.supervisor_visit_schedules
  add column if not exists regional_plan_id uuid references public.kpi_regional_plans(id) on delete set null,
  add column if not exists original_schedule jsonb not null default '{}'::jsonb,
  add column if not exists edited_from_original boolean not null default false,
  add column if not exists last_change_reason text;

create index if not exists supervisor_visit_schedules_regional_plan_idx
  on public.supervisor_visit_schedules(regional_plan_id, visit_date);

create table if not exists public.supervisor_visit_schedule_history (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null,
  supervisor_id uuid not null references public.profiles(id) on delete restrict,
  regional_plan_id uuid references public.kpi_regional_plans(id) on delete set null,
  changed_by uuid not null references public.profiles(id) on delete restrict,
  change_type text not null check (change_type in ('created','edited','cancelled')),
  change_reason text,
  before_schedule jsonb,
  after_schedule jsonb,
  changed_at timestamptz not null default now()
);

create index if not exists supervisor_visit_schedule_history_schedule_idx
  on public.supervisor_visit_schedule_history(schedule_id, changed_at desc);
create index if not exists supervisor_visit_schedule_history_supervisor_idx
  on public.supervisor_visit_schedule_history(supervisor_id, changed_at desc);

alter table public.supervisor_visit_schedule_history enable row level security;
revoke all on public.supervisor_visit_schedule_history from anon;
grant select on public.supervisor_visit_schedule_history to authenticated;
grant all on public.supervisor_visit_schedule_history to service_role;

drop policy if exists "leadership reads visit schedule history" on public.supervisor_visit_schedule_history;
create policy "leadership reads visit schedule history"
on public.supervisor_visit_schedule_history for select to authenticated
using (
  (select public.current_portal_role()) = 'admin'
  or (
    (select public.current_portal_role()) = 'supervisor'
    and supervisor_id = (select auth.uid())
  )
);

create or replace function public.audit_supervisor_visit_schedule()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_core jsonb;
  new_core jsonb;
  initial_core jsonb;
  change_kind text;
begin
  new_core := jsonb_build_object(
    'store_id', new.store_id,
    'visit_date', new.visit_date,
    'start_time', new.start_time,
    'end_time', new.end_time,
    'purpose', new.purpose,
    'notes', new.notes,
    'status', new.status
  );

  if tg_op = 'INSERT' then
    if new.original_schedule = '{}'::jsonb then new.original_schedule := new_core; end if;
    new.edited_from_original := false;
    insert into public.supervisor_visit_schedule_history
      (schedule_id, supervisor_id, regional_plan_id, changed_by, change_type, change_reason, after_schedule)
    values
      (new.id, new.supervisor_id, new.regional_plan_id, new.updated_by, 'created', nullif(btrim(new.last_change_reason),''), new_core);
    return new;
  end if;

  old_core := jsonb_build_object(
    'store_id', old.store_id,
    'visit_date', old.visit_date,
    'start_time', old.start_time,
    'end_time', old.end_time,
    'purpose', old.purpose,
    'notes', old.notes,
    'status', old.status
  );
  initial_core := coalesce(nullif(old.original_schedule, '{}'::jsonb), old_core);
  new.original_schedule := initial_core;
  new.edited_from_original := old.edited_from_original or new_core is distinct from initial_core;
  new.updated_at := now();

  if new_core is distinct from old_core then
    change_kind := case when new.status = 'cancelled' and old.status <> 'cancelled' then 'cancelled' else 'edited' end;
    insert into public.supervisor_visit_schedule_history
      (schedule_id, supervisor_id, regional_plan_id, changed_by, change_type, change_reason, before_schedule, after_schedule)
    values
      (new.id, new.supervisor_id, new.regional_plan_id, new.updated_by, change_kind, nullif(btrim(new.last_change_reason),''), old_core, new_core);
  end if;
  return new;
end;
$$;

drop trigger if exists audit_supervisor_visit_schedule_trigger on public.supervisor_visit_schedules;
create trigger audit_supervisor_visit_schedule_trigger
before insert or update on public.supervisor_visit_schedules
for each row execute function public.audit_supervisor_visit_schedule();

-- Backfill the original baseline without marking existing schedules as edited.
update public.supervisor_visit_schedules
set original_schedule = jsonb_build_object(
  'store_id', store_id,
  'visit_date', visit_date,
  'start_time', start_time,
  'end_time', end_time,
  'purpose', purpose,
  'notes', notes,
  'status', status
)
where original_schedule = '{}'::jsonb;
