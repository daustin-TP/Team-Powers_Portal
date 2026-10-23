-- Goals are keyed by the Sunday they measure, never by the Monday review date.
create function public.guard_kpi_goal_week() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare today date := (now() at time zone 'America/Chicago')::date;
begin
  if tg_op = 'DELETE' then raise exception 'Weekly commitments cannot be deleted.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.store_id::text || new.week_end::text,0));
  if extract(dow from new.week_end) <> 0 or new.week_end < today then
    raise exception 'Set goals for the current or a future Monday–Sunday week. Completed weeks are locked.';
  end if;
  if tg_op = 'UPDATE' and (old.store_id <> new.store_id or old.week_end <> new.week_end) then
    raise exception 'A commitment cannot be moved to another store or week.';
  end if;
  if exists (select 1 from public.kpi_weekly_results where store_id=new.store_id and week_end=new.week_end) then
    raise exception 'Results have arrived for this week. Its commitments are locked.';
  end if;
  return new;
end $$;
create trigger guard_kpi_goal_week before insert or update or delete on public.kpi_goal_commitments
for each row execute function public.guard_kpi_goal_week();
create function public.lock_kpi_result_week() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.store_id::text || new.week_end::text,0));
  return new;
end $$;
create trigger lock_kpi_result_week before insert or update on public.kpi_weekly_results
for each row execute function public.lock_kpi_result_week();
drop policy "store leaders manage kpi_goal_commitments" on public.kpi_goal_commitments;
create policy "supervisors manage future commitments" on public.kpi_goal_commitments for all to authenticated
using (public.can_access_store(store_id) and public.current_portal_role() in ('admin','supervisor'))
with check (public.can_access_store(store_id) and public.current_portal_role() in ('admin','supervisor'));

create table public.kpi_automatic_goals (
  store_id uuid not null references public.stores(id), week_end date not null,
  goals jsonb not null, generated_at timestamptz not null default now(),
  reconstructed boolean not null default false,
  primary key(store_id,week_end)
);
alter table public.kpi_automatic_goals enable row level security;
revoke all on public.kpi_automatic_goals from anon,authenticated;
grant select,insert on public.kpi_automatic_goals to service_role;
revoke update,delete on public.kpi_automatic_goals from service_role;

create table public.kpi_regional_plans (
  id uuid primary key default gen_random_uuid(),
  supervisor_id uuid not null references public.profiles(id),
  reviewer_id uuid references public.profiles(id),
  week_end date not null, followup_date date not null,
  status text not null default 'draft' check(status in ('draft','director_review','released','closed')),
  snapshot jsonb not null, admin_notes text not null default '', director_notes text not null default '',
  actions jsonb not null default '[]', followup_notes text not null default '',
  created_by uuid not null references public.profiles(id), updated_by uuid not null references public.profiles(id),
  version integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  released_at timestamptz, unique(supervisor_id,week_end)
);
alter table public.kpi_regional_plans enable row level security;
revoke all on public.kpi_regional_plans from anon,authenticated;
grant select,insert,update on public.kpi_regional_plans to service_role;
create index kpi_regional_plans_followup on public.kpi_regional_plans(status,followup_date);
